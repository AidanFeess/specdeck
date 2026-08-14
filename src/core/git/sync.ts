import { inspectRepo, readFetchAge, type GitCapability } from './repo.js';
import { git, splitNul } from './run.js';

/**
 * Per-file sync state, rolled up per change.
 *
 * Local state is live: it comes from the working tree and is always current.
 * Remote state is a snapshot from the last fetch, and may be hours old. Both
 * appear on the same card, so the age of the snapshot travels with the data
 * rather than being an occasional warning.
 */

export type FileSync = 'uncommitted' | 'ahead' | 'behind' | 'synced';

export interface SyncSummary {
  /** Absent when sync could not be computed. Nothing renders in that case. */
  available: boolean;
  /** Why it is unavailable, written for the interface. */
  reason?: string;
  problem?: string;
  branch?: string;
  remoteRef?: string;
  /** Milliseconds since the last fetch. */
  fetchAgeMs?: number;
  neverFetched?: boolean;
  /** Commits on each side of the merge base. Absent without an upstream. */
  aheadCommits?: number;
  behindCommits?: number;
  /** Repository-relative path to per-file state, forward slashes. */
  files: Record<string, FileSync>;
}

export interface ChangeSync {
  uncommitted: number;
  ahead: number;
  behind: number;
  /** True when every tracked file under the change matches the remote. */
  synced: boolean;
}

const OPENSPEC = 'openspec';

function normalize(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Computes sync state for everything under `openspec/`.
 *
 * Four git calls, each scoped to the OpenSpec tree rather than the whole
 * repository, so a large working tree does not slow the board down.
 */
export async function computeSync(projectRoot: string): Promise<SyncSummary> {
  const capability: GitCapability = await inspectRepo(projectRoot);

  if (capability.problem !== undefined) {
    // Every indicator is suppressed board wide. Rendering "in sync" because a
    // git command failed would be worse than rendering nothing at all.
    const summary: SyncSummary = { available: false, files: {} };
    if (capability.message !== undefined) summary.reason = capability.message;
    summary.problem = capability.problem;
    if (capability.branch !== undefined) summary.branch = capability.branch;

    // Uncommitted state is still meaningful without a remote, so it is reported
    // whenever the repository has commits at all.
    if (capability.problem === 'no-remote-ref') {
      const local = await localChanges(projectRoot);
      for (const path of local) summary.files[path] = 'uncommitted';
      summary.available = true;
    }
    return summary;
  }

  const remoteRef = capability.remoteRef ?? '';
  const files: Record<string, FileSync> = {};

  // Files that differ between the remote reference and HEAD. Direction matters:
  // added in HEAD means it is not on the remote, deleted in HEAD means the
  // remote has something this checkout does not.
  const remoteDiff = await git(
    ['diff', '--name-status', '-z', '--no-renames', remoteRef, 'HEAD', '--', OPENSPEC],
    { cwd: projectRoot },
  );
  if (remoteDiff.ok) {
    const parts = splitNul(remoteDiff.stdout);
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const status = (parts[i] ?? '').charAt(0);
      const path = normalize(parts[i + 1] ?? '');
      if (path === '') continue;
      files[path] = status === 'D' ? 'behind' : 'ahead';
    }
  }

  // Working tree against HEAD. `git diff` applies the clean filter, so a file
  // that differs only by line endings is correctly reported as unchanged.
  // `git status --porcelain` does not, and under Windows-default autocrlf it
  // reports every agent-written markdown file as permanently modified.
  for (const path of await localChanges(projectRoot)) {
    files[path] = 'uncommitted';
  }

  const summary: SyncSummary = {
    available: true,
    files,
    remoteRef,
  };
  if (capability.branch !== undefined) summary.branch = capability.branch;

  const age = readFetchAge(capability.gitDir);
  if (age.ageMs !== undefined) summary.fetchAgeMs = age.ageMs;
  summary.neverFetched = age.neverFetched;

  const counts = await git(['rev-list', '--left-right', '--count', `${remoteRef}...HEAD`], {
    cwd: projectRoot,
  });
  if (counts.ok) {
    const parts = counts.stdout.trim().split(/\s+/);
    const behind = Number(parts[0]);
    const ahead = Number(parts[1]);
    if (Number.isFinite(behind)) summary.behindCommits = behind;
    if (Number.isFinite(ahead)) summary.aheadCommits = ahead;
  }

  return summary;
}

/** Modified, staged, deleted, and untracked files under `openspec/`. */
async function localChanges(projectRoot: string): Promise<string[]> {
  const paths: string[] = [];

  const tracked = await git(['diff', '--name-only', '-z', 'HEAD', '--', OPENSPEC], {
    cwd: projectRoot,
  });
  if (tracked.ok) paths.push(...splitNul(tracked.stdout).map(normalize));

  const untracked = await git(
    ['ls-files', '--others', '--exclude-standard', '-z', '--', OPENSPEC],
    { cwd: projectRoot },
  );
  if (untracked.ok) paths.push(...splitNul(untracked.stdout).map(normalize));

  return [...new Set(paths)];
}

export interface RemoteOnlyChange {
  name: string;
  fileCount: number;
  /** Repository-relative directory, forward slashes. */
  dir: string;
}

/**
 * Changes that exist on the remote but not in this checkout.
 *
 * These have no local directory, so nothing else in specdeck can see them. They
 * are the whole reason a teammate's work is discoverable at all: without this,
 * a colleague could push an entire change and the board would look unchanged.
 *
 * @param changesPrefix Repository-relative path of the changes directory.
 * @param localNames Change names that do exist locally, which are excluded.
 */
export function remoteOnlyChanges(
  summary: SyncSummary,
  changesPrefix: string,
  localNames: Iterable<string>,
): RemoteOnlyChange[] {
  const known = new Set(localNames);
  const prefix = normalize(changesPrefix).replace(/\/+$/, '') + '/';
  const counts = new Map<string, number>();

  for (const [path, sync] of Object.entries(summary.files)) {
    if (sync !== 'behind' || !path.startsWith(prefix)) continue;

    const rest = path.slice(prefix.length);
    const firstSlash = rest.indexOf('/');
    if (firstSlash <= 0) continue;

    let name = rest.slice(0, firstSlash);
    // Archived changes live one level deeper, under `archive/<date>-<name>`.
    if (name === 'archive') {
      const inner = rest.slice(firstSlash + 1);
      const innerSlash = inner.indexOf('/');
      if (innerSlash <= 0) continue;
      name = inner.slice(0, innerSlash);
    }

    if (known.has(name)) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, fileCount]) => ({ name, fileCount, dir: `${prefix}${name}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Rolls per-file state up to one change.
 *
 * Worst-wins loses the extent of a desync but never its kind, so the counts are
 * kept rather than collapsing to a single flag.
 */
export function summarizeChange(summary: SyncSummary, changeRepoRelativeDir: string): ChangeSync {
  const prefix = normalize(changeRepoRelativeDir).replace(/\/+$/, '') + '/';
  let uncommitted = 0;
  let ahead = 0;
  let behind = 0;

  for (const [path, state] of Object.entries(summary.files)) {
    if (!path.startsWith(prefix)) continue;
    if (state === 'uncommitted') uncommitted += 1;
    else if (state === 'ahead') ahead += 1;
    else if (state === 'behind') behind += 1;
  }

  return { uncommitted, ahead, behind, synced: uncommitted + ahead + behind === 0 };
}
