import { git } from './run.js';

/**
 * Timeline data derived from git history.
 *
 * This is the part of specdeck that no amount of filesystem reading can
 * substitute for. `.openspec.yaml` records a creation date with no time and only
 * when the change was made by the CLI, and file modification times do not
 * survive a clone and are reordered by every branch checkout. Git is the only
 * durable record of when work actually happened.
 *
 * Cost is the reason this is shaped the way it is. Asking git per file would be
 * one subprocess per artifact per change. Instead a single log of the whole
 * OpenSpec tree is parsed once and bucketed by path, which is one subprocess for
 * an entire project.
 */

export interface PathHistory {
  /** ISO timestamp of the earliest commit touching this path. */
  firstWorked: string;
  /** ISO timestamp of the most recent commit touching this path. */
  lastWorked: string;
  commits: number;
}

export interface TreeHistory {
  available: boolean;
  reason?: string;
  /** Repository-relative path to its history, forward slashes. */
  paths: Record<string, PathHistory>;
  /** HEAD when this was computed, used as the cache key. */
  head?: string;
}

/**
 * Separators for parsing git's output.
 *
 * The format string asks git to emit these bytes with `%x1e` and `%x1f` rather
 * than embedding them literally in the argument. Node rejects argv entries
 * containing a null byte, and passing raw control characters through a process
 * argument is fragile in general, so git writes them into its own output
 * instead. Record and unit separators cannot occur in a commit hash or an ISO
 * timestamp, which is what makes them safe to split on.
 */
const RECORD = String.fromCharCode(30);
const FIELD = String.fromCharCode(31);
const RECORD_FORMAT = '%x1e';
const FIELD_FORMAT = '%x1f';

/**
 * Reads first and last activity for every path under `openspec/`.
 *
 * `--follow` is deliberately not used. It only works for a single path, and
 * OpenSpec renames whole directories when archiving, which git records as a
 * delete plus an add. The archive date is recovered from the directory name
 * instead, which is exact rather than heuristic.
 */
export async function readTreeHistory(projectRoot: string): Promise<TreeHistory> {
  const head = await git(['rev-parse', 'HEAD'], { cwd: projectRoot });
  if (!head.ok) {
    return {
      available: false,
      reason: 'This repository has no commits, so timeline data is unavailable.',
      paths: {},
    };
  }

  const log = await git(
    [
      'log',
      `--format=${RECORD_FORMAT}%H${FIELD_FORMAT}%aI`,
      '--name-only',
      '--no-renames',
      '--',
      'openspec',
    ],
    { cwd: projectRoot, timeoutMs: 30_000 },
  );

  if (!log.ok) {
    return {
      available: false,
      reason: 'Could not read git history for this project.',
      paths: {},
    };
  }

  const paths: Record<string, PathHistory> = {};

  for (const record of log.stdout.split(RECORD)) {
    if (record.trim() === '') continue;

    const newline = record.indexOf('\n');
    const header = newline === -1 ? record : record.slice(0, newline);
    const [, when] = header.split(FIELD);
    if (when === undefined || when === '') continue;

    const files = newline === -1 ? [] : record.slice(newline + 1).split('\n');
    for (const raw of files) {
      const file = raw.trim().replace(/\\/g, '/');
      if (file === '') continue;

      const existing = paths[file];
      if (existing === undefined) {
        // git log is newest first, so the first sighting is the last activity.
        paths[file] = { firstWorked: when, lastWorked: when, commits: 1 };
      } else {
        existing.commits += 1;
        if (when < existing.firstWorked) existing.firstWorked = when;
        if (when > existing.lastWorked) existing.lastWorked = when;
      }
    }
  }

  return { available: true, paths, head: head.stdout.trim() };
}

/**
 * Rolls path history up to a directory.
 *
 * Returns undefined when no file under the directory has ever been committed,
 * which is the normal state for a change an agent has just written.
 */
export function historyForPrefix(
  history: TreeHistory,
  repoRelativeDir: string,
): PathHistory | undefined {
  const prefix = repoRelativeDir.replace(/\\/g, '/').replace(/\/+$/, '') + '/';
  let first: string | undefined;
  let last: string | undefined;
  let commits = 0;

  for (const [path, entry] of Object.entries(history.paths)) {
    if (!path.startsWith(prefix)) continue;
    commits += entry.commits;
    if (first === undefined || entry.firstWorked < first) first = entry.firstWorked;
    if (last === undefined || entry.lastWorked > last) last = entry.lastWorked;
  }

  if (first === undefined || last === undefined) return undefined;
  return { firstWorked: first, lastWorked: last, commits };
}

export interface TaskEvent {
  /** ISO timestamp of the commit that ticked it. */
  when: string;
  /** The task text as it appeared when completed. */
  text: string;
  /** The numeric label, when the task had one. */
  id?: string;
}

/**
 * Reconstructs when individual tasks were ticked.
 *
 * This walks the patch history of one tasks file looking for lines that changed
 * from unchecked to checked. It is the most expensive query in specdeck, which
 * is why it is per change and on demand rather than part of a board render.
 *
 * Only additions of checked lines count. A tick and an untick of the same task
 * both appear as diffs, so the same task can legitimately report more than one
 * completion, and the timeline shows the most recent.
 */
export async function readTaskHistory(
  projectRoot: string,
  repoRelativeTasksPath: string,
): Promise<{ available: boolean; reason?: string; events: TaskEvent[] }> {
  const log = await git(
    [
      'log',
      `--format=${RECORD_FORMAT}%aI`,
      '--patch',
      '--unified=0',
      '--no-renames',
      '--reverse',
      '--',
      repoRelativeTasksPath,
    ],
    { cwd: projectRoot, timeoutMs: 30_000 },
  );

  if (!log.ok) {
    return { available: false, reason: 'Could not read history for this tasks file.', events: [] };
  }

  const completed = new Map<string, TaskEvent>();

  for (const record of log.stdout.split(RECORD)) {
    if (record.trim() === '') continue;

    const newline = record.indexOf('\n');
    const when = (newline === -1 ? record : record.slice(0, newline)).trim();
    if (when === '') continue;

    const body = newline === -1 ? '' : record.slice(newline + 1);
    for (const line of body.split('\n')) {
      // Added lines only. A leading "+++" is the file header, not content.
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      const match = /^\+\s*[-*]\s+\[[xX]\]\s+(?:(\d+(?:\.\d+)*)\s+)?(.*)$/.exec(line);
      if (!match) continue;

      const text = (match[2] ?? '').trim();
      if (text === '') continue;

      const event: TaskEvent = { when, text };
      const id = match[1];
      if (id !== undefined) event.id = id;
      // Later commits overwrite earlier ones, so a re-tick reports the latest.
      completed.set(id ?? text, event);
    }
  }

  return {
    available: true,
    events: [...completed.values()].sort((a, b) => a.when.localeCompare(b.when)),
  };
}
