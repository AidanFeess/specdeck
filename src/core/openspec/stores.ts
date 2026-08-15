import { parseJsonOutput, runOpenspec } from './run.js';

/**
 * Workspaces, context stores, and initiatives.
 *
 * OpenSpec 1.4 grew a cross-repository model, and specdeck consumes it rather
 * than inventing a parallel one. Everything here comes from OpenSpec's own
 * listing and diagnostic commands: which workspaces and stores exist is
 * OpenSpec's answer to give, and specdeck only decides which of them to show.
 *
 * Nothing here creates, modifies, or removes a registration. Adding a root to
 * specdeck's own registry is a specdeck concern; OpenSpec's registry is read.
 *
 * Every function is a process spawn, so none of this belongs on the state
 * payload that rebuilds on every filesystem event. It is fetched on demand and
 * carries the time it was computed, so the interface can show the age rather
 * than imply the answer is current.
 */

/** A finding from an OpenSpec diagnostic, in OpenSpec's own shape. */
export interface Diagnostic {
  severity: string;
  code?: string;
  message: string;
  target?: string;
  /** A command that would resolve it, when OpenSpec offers one. */
  fix?: string;
}

/**
 * Health of a root.
 *
 * `unknown` is not a synonym for healthy. A diagnostic that could not run has
 * told us nothing, and the interface renders nothing rather than a reassuring
 * badge it has not earned.
 */
export type Health = 'ok' | 'problem' | 'unknown';

export interface WorkspaceLink {
  name: string;
  path: string;
  status: Diagnostic[];
}

export interface Workspace {
  name: string;
  root: string;
  links: WorkspaceLink[];
  status: Diagnostic[];
  health: Health;
}

export interface ContextStore {
  id: string;
  root: string;
  status: Diagnostic[];
  health: Health;
}

export interface Initiative {
  id: string;
  /** The context store the initiative lives in. */
  store: string;
  title?: string;
}

export interface StoreSnapshot {
  workspaces: Workspace[];
  contextStores: ContextStore[];
  initiatives: Initiative[];
  /** Why a section is empty, when it is empty because something failed. */
  problems: string[];
  /** When this was computed, so the interface can show its age. */
  checkedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function readDiagnostics(value: unknown): Diagnostic[] {
  if (!Array.isArray(value)) return [];

  const found: Diagnostic[] = [];
  for (const raw of value) {
    const entry = asRecord(raw);
    if (entry === undefined) continue;
    const message = asString(entry.message);
    if (message === undefined) continue;

    const diagnostic: Diagnostic = {
      severity: asString(entry.severity) ?? 'error',
      message,
    };
    const code = asString(entry.code);
    const target = asString(entry.target);
    const fix = asString(entry.fix);
    if (code !== undefined) diagnostic.code = code;
    if (target !== undefined) diagnostic.target = target;
    if (fix !== undefined) diagnostic.fix = fix;
    found.push(diagnostic);
  }
  return found;
}

/** Health from a diagnostic that ran. Anything not a warning counts as a problem. */
function healthOf(status: Diagnostic[]): Health {
  if (status.length === 0) return 'ok';
  return 'problem';
}

async function readJson<T>(
  projectRoot: string,
  args: string[],
): Promise<{ value?: T; problem?: string }> {
  const result = await runOpenspec(projectRoot, args);
  // The JSON is on stdout; stderr carries notices that are not failures.
  const value = parseJsonOutput<T>(result.stdout) ?? parseJsonOutput<T>(result.output);

  if (value === undefined) {
    return {
      problem:
        result.failure === 'missing-openspec'
          ? (result.message ?? 'specdeck could not find its bundled copy of OpenSpec.')
          : `\`${result.command}\` did not return a result specdeck could read.`,
    };
  }
  return { value };
}

interface RawWorkspaceList {
  workspaces?: unknown;
}

interface RawStoreList {
  context_stores?: unknown;
}

interface RawInitiativeList {
  context_stores?: unknown;
}

function readWorkspace(raw: unknown): Workspace | undefined {
  const entry = asRecord(raw);
  const name = asString(entry?.name);
  if (entry === undefined || name === undefined) return undefined;

  const links: WorkspaceLink[] = [];
  if (Array.isArray(entry.links)) {
    for (const rawLink of entry.links) {
      const link = asRecord(rawLink);
      const linkName = asString(link?.name);
      const linkPath = asString(link?.path);
      if (link === undefined || linkName === undefined || linkPath === undefined) continue;
      links.push({ name: linkName, path: linkPath, status: readDiagnostics(link.status) });
    }
  }

  // A workspace whose own status is clean but whose links are broken is not
  // healthy: the links are the entire point of a workspace.
  const status = [...readDiagnostics(entry.status), ...links.flatMap((link) => link.status)];

  return {
    name,
    root: asString(entry.root) ?? '',
    links,
    status,
    health: healthOf(status),
  };
}

function readStore(raw: unknown): ContextStore | undefined {
  const entry = asRecord(raw);
  const id = asString(entry?.id);
  if (entry === undefined || id === undefined) return undefined;

  const status = readDiagnostics(entry.status);
  return { id, root: asString(entry.root) ?? '', status, health: healthOf(status) };
}

/**
 * Reads every root OpenSpec knows about, with health.
 *
 * Listing and diagnosing are separate commands, so both run and are merged:
 * `list` says what exists, `doctor` says whether it works. A root that lists but
 * whose diagnostic could not run keeps `unknown` health rather than inheriting
 * a clean bill from the listing.
 */
export async function readStores(
  projectRoot: string,
  now: () => Date = () => new Date(),
): Promise<StoreSnapshot> {
  const [workspaceList, storeList, storeDoctor, initiativeList] = await Promise.all([
    readJson<RawWorkspaceList>(projectRoot, ['workspace', 'list', '--json']),
    readJson<RawStoreList>(projectRoot, ['context-store', 'list', '--json']),
    readJson<RawStoreList>(projectRoot, ['context-store', 'doctor', '--json']),
    readJson<RawInitiativeList>(projectRoot, ['initiative', 'list', '--json']),
  ]);

  const problems: string[] = [];
  for (const outcome of [workspaceList, storeList, initiativeList]) {
    if (outcome.problem !== undefined) problems.push(outcome.problem);
  }

  const workspaces: Workspace[] = [];
  if (Array.isArray(workspaceList.value?.workspaces)) {
    for (const raw of workspaceList.value.workspaces) {
      const workspace = readWorkspace(raw);
      if (workspace !== undefined) workspaces.push(workspace);
    }
  }

  // Workspace health needs a per-workspace diagnostic, so it is fetched only
  // for the workspaces that actually exist.
  await Promise.all(
    workspaces.map(async (workspace) => {
      const doctor = await readJson<{ workspace?: unknown }>(projectRoot, [
        'workspace',
        'doctor',
        '--workspace',
        workspace.name,
        '--json',
        '--no-interactive',
      ]);
      if (doctor.value === undefined) {
        workspace.health = 'unknown';
        return;
      }
      const diagnosed = readWorkspace(doctor.value.workspace);
      if (diagnosed === undefined) {
        workspace.health = 'unknown';
        return;
      }
      workspace.status = diagnosed.status;
      workspace.health = diagnosed.health;
    }),
  );

  const stores: ContextStore[] = [];
  if (Array.isArray(storeList.value?.context_stores)) {
    for (const raw of storeList.value.context_stores) {
      const store = readStore(raw);
      if (store !== undefined) stores.push(store);
    }
  }

  if (storeDoctor.value === undefined) {
    // The listing said these exist; nothing said they are well.
    for (const store of stores) store.health = 'unknown';
  } else if (Array.isArray(storeDoctor.value.context_stores)) {
    const diagnosed = new Map<string, ContextStore>();
    for (const raw of storeDoctor.value.context_stores) {
      const store = readStore(raw);
      if (store !== undefined) diagnosed.set(store.id, store);
    }
    for (const store of stores) {
      const match = diagnosed.get(store.id);
      if (match === undefined) {
        store.health = 'unknown';
        continue;
      }
      store.status = match.status;
      store.health = match.health;
    }
  }

  const initiatives: Initiative[] = [];
  if (Array.isArray(initiativeList.value?.context_stores)) {
    for (const rawGroup of initiativeList.value.context_stores) {
      const group = asRecord(rawGroup);
      const store = asString(asRecord(group?.context_store)?.id) ?? '';
      if (!Array.isArray(group?.initiatives)) continue;
      for (const rawInitiative of group.initiatives) {
        const entry = asRecord(rawInitiative);
        const id = asString(entry?.id);
        if (id === undefined) continue;
        const initiative: Initiative = { id, store };
        const title = asString(entry?.title);
        if (title !== undefined) initiative.title = title;
        initiatives.push(initiative);
      }
    }
  }

  return { workspaces, contextStores: stores, initiatives, problems, checkedAt: now().toISOString() };
}
