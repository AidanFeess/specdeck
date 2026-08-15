import { resolve, sep } from 'node:path';

import { localFileSource } from '../fs/node-source.js';
import { historyForPrefix, readTreeHistory } from '../git/history.js';
import { deriveApproval } from '../approval/derive.js';
import type { Approval } from '../approval/types.js';
import type { Lane } from '../model/types.js';
import { readProject } from './project.js';

/**
 * The flat, cross-root list of changes.
 *
 * The board answers "what is happening in this project". This answers "what is
 * happening at all", which is the question issue #1525 opened with: across
 * several roots, which changes are active, which are stale, which are archived,
 * and when was each one created.
 *
 * Every field is still derived. Nothing here is a status somebody typed.
 */

/**
 * How confident the creation date is.
 *
 * Metadata is what OpenSpec recorded when the change was created. Git is a
 * reconstruction from the earliest commit touching the directory, which is a
 * good guess and not the same thing, so it is labelled rather than presented as
 * equivalent. A change with neither has no creation date at all, and shows none.
 */
export type DateSource = 'metadata' | 'git';

export interface IndexedChange {
  name: string;
  /** Absolute path of the change directory. */
  dir: string;
  lane: Lane;
  archived: boolean;
  /** Date prefix of an archived change's directory, when it has one. */
  archivedOn?: string;
  tasksCompleted: number;
  tasksTotal: number;
  artifactsDone: number;
  artifactsTotal: number;
  capabilities: string[];
  /** Absent when neither metadata nor git can say. */
  created?: string;
  createdFrom?: DateSource;
  /** ISO timestamp of the most recent commit touching the change. */
  lastModified?: string;
  /** The initiative this change is linked to, from its OpenSpec metadata. */
  initiative?: string;
  /** Which root it lives in, for grouping and filtering. */
  rootPath: string;
  rootName: string;
  issues: number;
  /** Derived from git. Absent when it could not be determined at all. */
  approval?: Approval;
}

export interface ChangeIndex {
  changes: IndexedChange[];
  /** Roots that could not be read, so the list can say so rather than shrink silently. */
  problems: Array<{ path: string; message: string }>;
  scannedAt: string;
}

/** Path of `target` relative to `root`, forward slashes, or undefined. */
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

async function indexRoot(
  path: string,
  name: string | undefined,
): Promise<{ changes: IndexedChange[]; problem?: { path: string; message: string } }> {
  const result = await readProject(localFileSource, path, name === undefined ? {} : { name });
  if (!result.ok) {
    return { changes: [], problem: { path, message: result.failure.message } };
  }

  const snapshot = result.snapshot;
  const history = await readTreeHistory(resolve(path));

  // One `git log --grep` per change. The index is fetched on demand, never on
  // the path that rebuilds when a file changes, so this stays affordable.
  const approvals = await Promise.all(
    snapshot.changes.map((change) => deriveApproval(resolve(path), change.name, change.dir)),
  );

  const changes = snapshot.changes.map((change, position) => {
    const relative = relativePath(resolve(path), change.dir);
    const entry =
      history.available && relative !== undefined ? historyForPrefix(history, relative) : undefined;

    const indexed: IndexedChange = {
      name: change.name,
      dir: change.dir,
      lane: change.lane,
      archived: change.location === 'archived',
      tasksCompleted: change.tasks.completed,
      tasksTotal: change.tasks.total,
      artifactsDone: change.artifacts.filter((a) => a.status === 'done').length,
      artifactsTotal: change.artifacts.length,
      capabilities: change.capabilities,
      rootPath: snapshot.path,
      rootName: snapshot.name,
      issues: change.issues.length + change.deltaSpecs.reduce((n, d) => n + d.issues.length, 0),
    };

    const approval = approvals[position];
    if (approval !== undefined) indexed.approval = approval;

    if (change.archivedOn !== undefined) indexed.archivedOn = change.archivedOn;
    if (change.metadata.initiative !== undefined) {
      indexed.initiative = change.metadata.initiative.id;
    }
    if (entry !== undefined) indexed.lastModified = entry.lastWorked;

    // Metadata first, git as a labelled fallback, nothing when neither knows.
    if (change.metadata.created !== undefined) {
      indexed.created = change.metadata.created;
      indexed.createdFrom = 'metadata';
    } else if (entry !== undefined) {
      indexed.created = entry.firstWorked;
      indexed.createdFrom = 'git';
    }

    return indexed;
  });

  return { changes };
}

/**
 * Indexes every root given.
 *
 * A root that cannot be read contributes a problem rather than throwing, so one
 * broken registration never empties the list.
 */
export async function indexChanges(
  roots: Array<{ path: string; name?: string }>,
  now: () => Date = () => new Date(),
): Promise<ChangeIndex> {
  const results = await Promise.all(roots.map((root) => indexRoot(root.path, root.name)));

  const changes: IndexedChange[] = [];
  const problems: Array<{ path: string; message: string }> = [];
  for (const result of results) {
    changes.push(...result.changes);
    if (result.problem !== undefined) problems.push(result.problem);
  }

  return { changes, problems, scannedAt: now().toISOString() };
}
