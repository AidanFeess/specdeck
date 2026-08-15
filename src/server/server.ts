import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { resolve, sep } from 'node:path';

import { localFileSource } from '../core/fs/node-source.js';
import {
  readConfig,
  writeConfig,
  addProject,
  removeProject,
  setProjectStarred,
  setProjectOrder,
  setEditorPreference,
  pathKey,
  samePath,
  type EditorPreference,
} from '../core/config/store.js';
import { readProject } from '../core/read/project.js';
import { checkBundledOpenSpec } from '../core/openspec/installed.js';
import { specdeckVersion } from '../core/version.js';
import { detectHarnesses } from '../core/openspec/harness.js';
import { listInitTools, runInit, type InitTool } from '../core/openspec/init.js';
import { toggleTask } from '../core/write/toggle-task.js';
import {
  computeSync,
  remoteOnlyChanges,
  summarizeChange,
  type ChangeSync,
} from '../core/git/sync.js';
import { fetchRemote, pullFastForward } from '../core/git/repo.js';
import { readOverview } from '../core/read/overview.js';
import { orderProjects, isProjectSort, type ProjectPlacement } from '../core/read/order.js';
import { archiveChange, preflightArchive } from '../core/openspec/archive.js';
import { openInEditor, type EditorChoice } from './editor.js';
import { detectEditors } from './editors.js';
import { dispatch, discoverSessions } from './handoff.js';
import {
  historyForPrefix,
  readTaskHistory,
  readTreeHistory,
  type TreeHistory,
} from '../core/git/history.js';
import { browseForFolder } from './browse.js';
import { watchProject, type WatchHandle } from './watch.js';
import { APP_HTML } from './app-html.js';

/**
 * The local HTTP server.
 *
 * Bound to loopback only. specdeck reads a developer's source tree, so it must
 * never be reachable from the network, and there is no authentication because
 * there is nothing to authenticate against.
 *
 * Updates are pushed over server-sent events rather than a websocket. The data
 * flows one way, and SSE reconnects on its own without any client code.
 */

interface Client {
  id: number;
  response: ServerResponse;
}

export interface StartOptions {
  port?: number;
  host?: string;
  /** Project opened on launch, usually the working directory. */
  initialProject?: string;
}

export interface RunningServer {
  server: Server;
  url: string;
  close(): Promise<void>;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

export async function startServer(options: StartOptions = {}): Promise<RunningServer> {
  const host = options.host ?? '127.0.0.1';
  const clients = new Set<Client>();
  let nextClientId = 1;

  let activeProject = options.initialProject ?? process.cwd();
  let watcher: WatchHandle | undefined;

  const broadcast = (): void => {
    for (const client of clients) {
      client.response.write('event: change\ndata: {}\n\n');
    }
  };

  const rewatch = (root: string): void => {
    void watcher?.close();
    watcher = watchProject(root, { onChange: () => broadcast() });
  };

  rewatch(activeProject);

  let historyCache: { root: string; head: string; history: TreeHistory } | undefined;

  async function treeHistory(): Promise<TreeHistory> {
    const root = resolve(activeProject);
    const fresh = await readTreeHistory(root);
    if (!fresh.available || fresh.head === undefined) return fresh;
    if (historyCache?.root === root && historyCache.head === fresh.head)
      return historyCache.history;
    historyCache = { root, head: fresh.head, history: fresh };
    return fresh;
  }

  async function buildState() {
    const config = await readConfig();
    const [project, harnesses, sync] = await Promise.all([
      readProject(localFileSource, activeProject),
      detectHarnesses(localFileSource, activeProject),
      computeSync(activeProject),
    ]);

    // Per-change rollups are computed here rather than in the client, so the
    // repository-relative path arithmetic lives next to the git layer that
    // produced the paths.
    const changeSync: Record<string, ChangeSync> = {};
    let remoteOnly: ReturnType<typeof remoteOnlyChanges> = [];

    if (sync.available && project.ok) {
      const root = resolve(activeProject);
      for (const change of project.snapshot.changes) {
        const relative = relativePath(root, change.dir);
        if (relative !== undefined) changeSync[change.name] = summarizeChange(sync, relative);
      }

      const changesRelative = relativePath(root, project.snapshot.planningHome.changesDir);
      if (changesRelative !== undefined) {
        remoteOnly = remoteOnlyChanges(
          sync,
          changesRelative,
          project.snapshot.changes.map((change) => change.name),
        );
      }
    }

    const sessions = discoverSessions(resolve(activeProject));

    let initTools: InitTool[] = [];
    if (!project.ok && project.failure.problem === 'not-openspec') {
      initTools = await listInitTools(localFileSource, activeProject);
    }

    return {
      version: specdeckVersion(),
      config,
      activeProject,
      project,
      initTools,
      openspec: checkBundledOpenSpec(),
      harnesses,
      sessions,
      sync,
      changeSync,
      remoteOnly,
    };
  }

  const server = createServer((request, response) => {
    void (async (): Promise<void> => {
      const url = new URL(request.url ?? '/', `http://${host}`);
      const path = url.pathname;

      // Loopback only, but a browser page on another origin could still reach
      // this server, so cross-origin requests are refused outright.
      const origin = request.headers.origin;
      if (
        origin !== undefined &&
        !origin.startsWith('http://127.0.0.1') &&
        !origin.startsWith('http://localhost')
      ) {
        json(response, 403, { error: 'Cross-origin requests are not allowed.' });
        return;
      }

      if (path === '/' || path === '/index.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(APP_HTML);
        return;
      }

      if (path === '/api/state') {
        json(response, 200, await buildState());
        return;
      }

      if (path === '/api/events') {
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        });
        response.write('retry: 1000\n\n');
        const client: Client = { id: nextClientId++, response };
        clients.add(client);
        request.on('close', () => clients.delete(client));
        return;
      }

      if (path === '/api/open' && request.method === 'POST') {
        const body = await readBody(request);
        const target = (body as { path?: unknown } | undefined)?.path;
        if (typeof target !== 'string' || target === '') {
          json(response, 400, { error: 'A project path is required.' });
          return;
        }
        activeProject = resolve(target);
        rewatch(activeProject);
        json(response, 200, await buildState());
        return;
      }

      if (path === '/api/projects' && request.method === 'POST') {
        const body = await readBody(request);
        const target = (body as { path?: unknown } | undefined)?.path;
        if (typeof target !== 'string' || target === '') {
          json(response, 400, { error: 'A project path is required.' });
          return;
        }
        await addProject(resolve(target));
        json(response, 200, await buildState());
        return;
      }

      if (path === '/api/projects' && request.method === 'DELETE') {
        const body = await readBody(request);
        const target = (body as { path?: unknown } | undefined)?.path;
        if (typeof target !== 'string') {
          json(response, 400, { error: 'A project path is required.' });
          return;
        }
        await removeProject(resolve(target));
        json(response, 200, await buildState());
        return;
      }

      if (path === '/api/task/toggle' && request.method === 'POST') {
        const body = (await readBody(request)) as
          { path?: unknown; line?: unknown; text?: unknown; completed?: unknown } | undefined;

        const tasksPath = typeof body?.path === 'string' ? resolve(body.path) : undefined;
        const line = typeof body?.line === 'number' ? body.line : undefined;
        const text = typeof body?.text === 'string' ? body.text : undefined;
        const completed = typeof body?.completed === 'boolean' ? body.completed : undefined;

        if (
          tasksPath === undefined ||
          line === undefined ||
          text === undefined ||
          completed === undefined
        ) {
          json(response, 400, { error: 'path, line, text, and completed are required.' });
          return;
        }

        // The only write specdeck performs, so it is fenced to the project the
        // user actually has open. A path outside it is refused outright.
        const projectRoot = resolve(activeProject);
        if (!tasksPath.startsWith(projectRoot + sep) && tasksPath !== projectRoot) {
          json(response, 403, { error: 'That file is outside the project that is open.' });
          return;
        }

        const outcome = await toggleTask(tasksPath, line, text, completed);
        json(response, outcome.ok ? 200 : 409, outcome);
        return;
      }

      if (path === '/api/fetch' && request.method === 'POST') {
        const outcome = await fetchRemote(activeProject);
        json(response, 200, { ...outcome, state: await buildState() });
        return;
      }

      // Overviews are read on demand rather than with every board render,
      // because each one costs a full project read.
      if (path === '/api/overview') {
        const config = await readConfig();

        // Paths are compared in normalized form before deduping. A config
        // written with forward slashes and a resolved working directory are the
        // same folder, and listing it twice would be both wrong and confusing.
        // The displayed path stays in resolved form so every later lookup, here
        // and in the client, is against one spelling.
        const byKey = new Map<string, { path: string; name?: string }>();
        for (const entry of config.projects) {
          const key = pathKey(entry.path);
          if (byKey.has(key)) continue;
          const canonical: { path: string; name?: string } = { path: resolve(entry.path) };
          if (entry.name !== undefined) canonical.name = entry.name;
          byKey.set(key, canonical);
        }
        const active = resolve(activeProject);
        if (!byKey.has(pathKey(active))) byKey.set(pathKey(active), { path: active });

        const overviews = await Promise.all(
          [...byKey.values()].map((entry) => readOverview(entry.path, entry.name)),
        );

        const placements = new Map<string, ProjectPlacement>();
        for (const entry of config.projects) {
          const canonical = byKey.get(pathKey(entry.path));
          if (canonical === undefined) continue;
          const placement: ProjectPlacement = { path: canonical.path };
          if (entry.starred === true) placement.starred = true;
          if (entry.order !== undefined) placement.order = entry.order;
          placements.set(placement.path, placement);
        }

        const sortParam = url.searchParams.get('sort');
        const sort = isProjectSort(sortParam) ? sortParam : 'manual';

        json(response, 200, {
          activeProject: active,
          sort,
          overviews: orderProjects(overviews, placements, sort),
          placements: [...placements.values()],
        });
        return;
      }

      if (path === '/api/projects/star' && request.method === 'POST') {
        const body = (await readBody(request)) as { path?: unknown; starred?: unknown } | undefined;
        const target = typeof body?.path === 'string' ? resolve(body.path) : undefined;
        if (target === undefined) {
          json(response, 400, { error: 'A project path is required.' });
          return;
        }
        await setProjectStarred(target, body?.starred === true);
        json(response, 200, { ok: true });
        return;
      }

      if (path === '/api/projects/order' && request.method === 'POST') {
        const body = (await readBody(request)) as { paths?: unknown } | undefined;
        if (!Array.isArray(body?.paths)) {
          json(response, 400, { error: 'An ordered list of paths is required.' });
          return;
        }
        const paths = body.paths
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => resolve(entry));
        await setProjectOrder(paths);
        json(response, 200, { ok: true });
        return;
      }

      // The native folder picker. Only the local server can do this: a browser
      // strips the real path from directory inputs.
      if (path === '/api/browse' && request.method === 'POST') {
        const result = await browseForFolder(activeProject);
        if (result.ok && result.path !== undefined) {
          await addProject(result.path);
          activeProject = result.path;
          rewatch(activeProject);
          json(response, 200, { ...result, state: await buildState() });
          return;
        }
        json(response, 200, result);
        return;
      }

      if (path === '/api/history') {
        const history = await treeHistory();
        const root = resolve(activeProject);
        const project = await readProject(localFileSource, root);
        const changes: Record<string, unknown> = {};
        if (project.ok && history.available) {
          for (const change of project.snapshot.changes) {
            const relative = relativePath(root, change.dir);
            if (relative === undefined) continue;
            const entry = historyForPrefix(history, relative);
            if (entry !== undefined) changes[change.name] = entry;
          }
        }
        json(response, 200, { available: history.available, reason: history.reason, changes });
        return;
      }

      if (path === '/api/history/tasks') {
        const name = url.searchParams.get('change') ?? '';
        const root = resolve(activeProject);
        const project = await readProject(localFileSource, root);
        const change = project.ok
          ? project.snapshot.changes.find((entry) => entry.name === name)
          : undefined;
        if (change === undefined) {
          json(response, 404, { available: false, reason: 'No such change.', events: [] });
          return;
        }
        const tasksArtifact = change.artifacts
          .flatMap((artifact) => artifact.existingPaths)
          .find((candidate) => /tasks.md$/i.test(candidate));
        if (tasksArtifact === undefined) {
          json(response, 200, {
            available: false,
            reason: 'This change has no tasks file.',
            events: [],
          });
          return;
        }
        const relative = relativePath(root, tasksArtifact);
        if (relative === undefined) {
          json(response, 200, {
            available: false,
            reason: 'That file is outside the project.',
            events: [],
          });
          return;
        }
        json(response, 200, await readTaskHistory(root, relative));
        return;
      }

      if (path === '/api/archive/preflight') {
        const name = url.searchParams.get('change') ?? '';
        const project = await readProject(localFileSource, activeProject);
        const change = project.ok
          ? project.snapshot.changes.find((entry) => entry.name === name)
          : undefined;
        if (change === undefined) {
          json(response, 404, { error: 'No such change.' });
          return;
        }
        json(
          response,
          200,
          await preflightArchive(activeProject, name, change.tasks.completed, change.tasks.total),
        );
        return;
      }

      if (path === '/api/archive' && request.method === 'POST') {
        const body = (await readBody(request)) as { change?: unknown } | undefined;
        const name = typeof body?.change === 'string' ? body.change : '';
        if (name === '') {
          json(response, 400, { error: 'A change name is required.' });
          return;
        }
        const outcome = await archiveChange(activeProject, name);
        json(response, 200, { ...outcome, state: await buildState() });
        return;
      }

      if (path === '/api/handoff' && request.method === 'POST') {
        const body = (await readBody(request)) as
          { harness?: unknown; method?: unknown; session?: unknown } | undefined;
        const harnessId = typeof body?.harness === 'string' ? body.harness : '';
        const method = body?.method;
        const preferred =
          method === 'attach' || method === 'terminal' || method === 'clipboard' ? method : 'auto';

        const dispatchRequest: Parameters<typeof dispatch>[0] = {
          projectRoot: resolve(activeProject),
          harnessId,
          preferred,
        };
        if (typeof body?.session === 'string' && body.session !== '') {
          dispatchRequest.sessionId = body.session;
        }

        json(response, 200, await dispatch(dispatchRequest));
        return;
      }

      if (path === '/api/editors') {
        const config = await readConfig();
        const body: {
          editors: Awaited<ReturnType<typeof detectEditors>>;
          remembered?: EditorPreference;
        } = {
          editors: await detectEditors(),
        };
        if (config.defaults.editor !== undefined) body.remembered = config.defaults.editor;
        json(response, 200, body);
        return;
      }

      if (path === '/api/editor' && request.method === 'POST') {
        const body = (await readBody(request)) as
          | {
              path?: unknown;
              command?: unknown;
              system?: unknown;
              remember?: unknown;
              label?: unknown;
            }
          | undefined;

        const target = typeof body?.path === 'string' ? resolve(body.path) : undefined;
        if (target === undefined) {
          json(response, 400, { error: 'A file path is required.' });
          return;
        }
        const projectRoot = resolve(activeProject);
        if (!target.startsWith(projectRoot + sep)) {
          json(response, 403, { error: 'That file is outside the project that is open.' });
          return;
        }

        const config = await readConfig();
        let choice: EditorChoice | undefined;

        if (body?.system === true) choice = { kind: 'system' };
        else if (typeof body?.command === 'string' && body.command !== '') {
          choice = { kind: 'command', command: body.command };
        } else if (config.defaults.editor !== undefined) {
          const stored = config.defaults.editor;
          choice =
            stored.kind === 'system' || stored.command === undefined
              ? { kind: 'system' }
              : { kind: 'command', command: stored.command };
        }

        if (choice === undefined) {
          // No choice supplied and nothing remembered, so the client asks.
          json(response, 200, { ok: false, needsChoice: true });
          return;
        }

        const outcome = await openInEditor(target, choice);

        // Remember only on success. Storing a preference that just failed would
        // make every later open fail the same way.
        if (outcome.ok && body?.remember === true) {
          const preference: EditorPreference =
            choice.kind === 'system'
              ? { kind: 'system' }
              : { kind: 'command', command: choice.command };
          if (typeof body.label === 'string' && body.label !== '') preference.label = body.label;
          await setEditorPreference(preference);
        }

        json(response, outcome.ok ? 200 : 409, outcome);
        return;
      }

      if (path === '/api/settings/editor' && request.method === 'POST') {
        const body = (await readBody(request)) as
          { clear?: unknown; system?: unknown; command?: unknown; label?: unknown } | undefined;

        if (body?.clear === true) {
          await setEditorPreference(undefined);
          json(response, 200, await buildState());
          return;
        }

        let preference: EditorPreference | undefined;
        if (body?.system === true) preference = { kind: 'system' };
        else if (typeof body?.command === 'string' && body.command !== '') {
          preference = { kind: 'command', command: body.command };
          if (typeof body.label === 'string' && body.label !== '') preference.label = body.label;
        }

        if (preference === undefined) {
          json(response, 400, { error: 'An editor or the system default is required.' });
          return;
        }

        await setEditorPreference(preference);
        json(response, 200, await buildState());
        return;
      }

      if (path === '/api/settings' && request.method === 'POST') {
        const body = (await readBody(request)) as
          { handoffMethod?: unknown; scope?: unknown } | undefined;
        const method = body?.handoffMethod;
        if (
          method !== 'auto' &&
          method !== 'attach' &&
          method !== 'terminal' &&
          method !== 'clipboard'
        ) {
          json(response, 400, { error: 'Unknown handoff method.' });
          return;
        }
        const config = await readConfig();
        if (body?.scope === 'project') {
          const target = resolve(activeProject);
          const entry = config.projects.find((p2) => samePath(p2.path, target));
          if (entry === undefined) config.projects.push({ path: target, handoffMethod: method });
          else entry.handoffMethod = method;
        } else {
          config.defaults.handoffMethod = method;
        }
        await writeConfig(config);
        json(response, 200, await buildState());
        return;
      }

      if (path === '/api/init' && request.method === 'POST') {
        const body = (await readBody(request)) as { tools?: unknown } | undefined;
        const tools = Array.isArray(body?.tools)
          ? body.tools.filter((entry): entry is string => typeof entry === 'string')
          : [];
        const outcome = await runInit(activeProject, tools);
        json(response, 200, { ...outcome, state: await buildState() });
        return;
      }

      if (path === '/api/pull' && request.method === 'POST') {
        const outcome = await pullFastForward(activeProject);
        json(response, 200, { ...outcome, state: await buildState() });
        return;
      }

      json(response, 404, { error: `No route for ${path}` });
    })().catch((error: unknown) => {
      json(response, 500, {
        error: error instanceof Error ? error.message : 'Unexpected server error.',
      });
    });
  });

  const port = await listen(server, options.port ?? 0, host);

  return {
    server,
    url: `http://${host}:${port}`,
    async close(): Promise<void> {
      for (const client of clients) client.response.end();
      clients.clear();
      await watcher?.close();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

/**
 * Binds the server, falling back to an ephemeral port if the requested one is
 * taken, so a second specdeck never fails to start with an opaque EADDRINUSE.
 */
function listen(server: Server, preferred: number, host: string): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      if (error.code === 'EADDRINUSE' && preferred !== 0) {
        server.removeListener('error', onError);
        server.listen(0, host, () => resolvePort(addressPort(server)));
        return;
      }
      reject(error);
    };

    server.once('error', onError);
    server.listen(preferred, host, () => {
      server.removeListener('error', onError);
      resolvePort(addressPort(server));
    });
  });
}

function addressPort(server: Server): number {
  const address = server.address();
  return typeof address === 'object' && address !== null ? address.port : 0;
}

/**
 * Path of `target` relative to `root`, in forward slashes, or undefined when
 * it is not underneath.
 */
function relativePath(root: string, target: string): string | undefined {
  const a = resolve(root);
  const b = resolve(target);
  if (b === a) return '';
  if (!b.startsWith(a + sep)) return undefined;
  return b
    .slice(a.length + 1)
    .split(sep)
    .join('/');
}
