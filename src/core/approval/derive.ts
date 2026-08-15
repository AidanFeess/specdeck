import { relative, resolve } from 'node:path';

import { git } from '../git/run.js';
import { CHANGE_TRAILER, APPROVER_TRAILER, readTrailer } from './types.js';
import type { Approval, ApprovalRecord } from './types.js';

/**
 * Reading approval back out of git.
 *
 * Nothing here is cached. The whole point of recording approval as a commit is
 * that the repository is the only copy, so every answer is recomputed from it.
 */

// Field and record separators that cannot appear in a commit message.
const FIELD = '\x1f';
const RECORD = '\x1e';

/** Repository-relative path in forward slashes, or undefined when outside. */
async function repoRelative(projectRoot: string, target: string): Promise<string | undefined> {
  const top = await git(['rev-parse', '--show-toplevel'], { cwd: projectRoot });
  if (!top.ok) return undefined;

  const root = resolve(top.stdout.trim());
  const path = relative(root, resolve(target)).split(/[\\/]/).join('/');
  return path.startsWith('..') ? undefined : path;
}

/**
 * Finds the newest commit approving this change, and whether anything has moved
 * since.
 *
 * `changeDir` is the change's directory on disk. It is converted to a
 * repository-relative pathspec rather than passed through, because an absolute
 * Windows path with backslashes is not a pathspec git will match reliably.
 */
export async function deriveApproval(
  projectRoot: string,
  changeName: string,
  changeDir: string,
): Promise<Approval> {
  const path = await repoRelative(projectRoot, changeDir);
  if (path === undefined) {
    return {
      state: 'unknown',
      reason: 'This change is not inside a git repository, so approval cannot be read.',
    };
  }

  // Searched by trailer rather than by path. An approval of a change that was
  // already committed is an empty commit, and an empty commit touches no path,
  // so `git log -- <dir>` would never list the very approvals that are most
  // common. The grep is only a prefilter; the trailer is checked exactly below.
  const log = await git(
    [
      'log',
      '--fixed-strings',
      `--grep=${CHANGE_TRAILER}: ${changeName}`,
      `--format=%H${FIELD}%an${FIELD}%ae${FIELD}%aI${FIELD}%B${RECORD}`,
    ],
    { cwd: projectRoot },
  );
  if (!log.ok) {
    return {
      state: 'unknown',
      reason: 'The repository history for this change could not be read.',
    };
  }

  const latest = findApproval(log.stdout, changeName);
  if (latest === undefined) return { state: 'never-approved' };

  const drift = await driftSince(projectRoot, latest.commit, path);
  if (drift === undefined) {
    return {
      state: 'unknown',
      reason: 'This change has been approved, but whether it has changed since could not be read.',
      latest,
    };
  }

  return drift.length === 0
    ? { state: 'approved', latest }
    : { state: 'needs-review', latest, drift };
}

/** The newest record in `git log` output carrying this change's trailer. */
function findApproval(output: string, changeName: string): ApprovalRecord | undefined {
  for (const record of output.split(RECORD)) {
    const fields = record.replace(/^[\r\n]+/, '').split(FIELD);
    if (fields.length < 5) continue;

    const [commit, name, email, approvedAt, body] = fields;
    if (commit === undefined || body === undefined) continue;
    if (readTrailer(body, CHANGE_TRAILER) !== changeName) continue;

    // The trailer is the display name; the commit author is the fallback, since
    // an approval made outside specdeck may carry no approver trailer at all.
    const approver = readTrailer(body, APPROVER_TRAILER);
    const parsed = approver === undefined ? undefined : parseApprover(approver);

    return {
      commit,
      approver: parsed ?? { name: name ?? '', email: email ?? '' },
      approvedAt: approvedAt ?? '',
    };
  }
  return undefined;
}

function parseApprover(value: string): { name: string; email: string } | undefined {
  const match = /^(.*?)\s*<([^>]*)>$/.exec(value);
  if (match === null) return { name: value, email: '' };
  return { name: match[1] ?? '', email: match[2] ?? '' };
}

/**
 * Paths under `path` that differ from the approving commit.
 *
 * Both kinds of drift count. A teammate committing over an approved change and
 * a local edit nobody has committed are equally reasons the approval no longer
 * describes what is on disk.
 *
 * Returns undefined when drift could not be determined, which the caller
 * reports as unknown rather than treating as clean.
 */
async function driftSince(
  projectRoot: string,
  commit: string,
  path: string,
): Promise<string[] | undefined> {
  const committed = await git(['diff', '--name-only', commit, 'HEAD', '--', path], {
    cwd: projectRoot,
  });
  if (!committed.ok) return undefined;

  const working = await git(['status', '--porcelain', '--', path], { cwd: projectRoot });
  if (!working.ok) return undefined;

  const drift = new Set<string>();
  for (const line of committed.stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed !== '') drift.add(trimmed);
  }
  for (const line of working.stdout.split(/\r?\n/)) {
    // Porcelain v1 is two status characters, a space, then the path.
    const entry = line.slice(3).trim();
    if (entry === '') continue;
    // A rename is reported as "old -> new"; the new path is the one that exists.
    const arrow = entry.lastIndexOf(' -> ');
    drift.add(arrow === -1 ? entry : entry.slice(arrow + 4));
  }

  return [...drift].sort();
}
