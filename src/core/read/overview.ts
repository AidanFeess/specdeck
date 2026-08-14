import { localFileSource } from '../fs/node-source.js';
import { computeSync, summarizeChange } from '../git/sync.js';
import { historyForPrefix, readTreeHistory } from '../git/history.js';
import type { Lane } from '../model/types.js';
import { readProject } from './project.js';

/**
 * Lightweight summaries for the projects home screen.
 *
 * Each project is read fully, because a change's lane is derived from its files
 * and there is no cheaper way to know it. The saving is that this runs only when
 * the home screen is shown, not on every board render.
 */

export interface ProjectOverview {
  path: string;
  name: string;
  ok: boolean;
  /** Why it could not be read, when it could not be. */
  problem?: string;
  message?: string;
  changes: number;
  capabilities: number;
  /** Count of active changes per lane. */
  lanes: Partial<Record<Lane, number>>;
  tasksCompleted: number;
  tasksTotal: number;
  /** Changes with uncommitted work, and changes not pushed. */
  dirty: number;
  unpushed: number;
  /** Changes present on the remote but not locally. */
  incoming: number;
  /** ISO timestamp of the most recent commit anywhere under openspec/. */
  lastActivity?: string;
  syncAvailable: boolean;
}

export async function readOverview(path: string, name?: string): Promise<ProjectOverview> {
  const result = await readProject(localFileSource, path, name === undefined ? {} : { name });

  if (!result.ok) {
    return {
      path,
      name: result.failure.name,
      ok: false,
      problem: result.failure.problem,
      message: result.failure.message,
      changes: 0,
      capabilities: 0,
      lanes: {},
      tasksCompleted: 0,
      tasksTotal: 0,
      dirty: 0,
      unpushed: 0,
      incoming: 0,
      syncAvailable: false,
    };
  }

  const snapshot = result.snapshot;
  const lanes: Partial<Record<Lane, number>> = {};
  let tasksCompleted = 0;
  let tasksTotal = 0;

  for (const change of snapshot.changes) {
    lanes[change.lane] = (lanes[change.lane] ?? 0) + 1;
    tasksCompleted += change.tasks.completed;
    tasksTotal += change.tasks.total;
  }

  const overview: ProjectOverview = {
    path,
    name: snapshot.name,
    ok: true,
    changes: snapshot.changes.length,
    capabilities: snapshot.capabilities.length,
    lanes,
    tasksCompleted,
    tasksTotal,
    dirty: 0,
    unpushed: 0,
    incoming: 0,
    syncAvailable: false,
  };

  // Git is an enhancement here, never a requirement. A project outside a
  // repository still gets a complete card, just without sync and activity.
  try {
    const sync = await computeSync(path);
    if (sync.available) {
      overview.syncAvailable = true;
      const root = snapshot.planningHome.root;
      for (const change of snapshot.changes) {
        const relative = toRelative(root, change.dir);
        if (relative === undefined) continue;
        const summary = summarizeChange(sync, relative);
        if (summary.uncommitted > 0) overview.dirty += 1;
        if (summary.ahead > 0) overview.unpushed += 1;
      }
      overview.incoming = Object.values(sync.files).filter((state) => state === 'behind').length;
    }

    const history = await readTreeHistory(path);
    if (history.available) {
      const whole = historyForPrefix(history, 'openspec');
      if (whole !== undefined) overview.lastActivity = whole.lastWorked;
    }
  } catch {
    // Sync and history are both optional. A failure in either leaves the rest
    // of the card intact rather than losing the project entirely.
  }

  return overview;
}

function toRelative(root: string, target: string): string | undefined {
  const a = root.replace(/\\/g, '/').replace(/\/+$/, '');
  const b = target.replace(/\\/g, '/');
  if (!b.startsWith(a + '/')) return undefined;
  return b.slice(a.length + 1);
}
