import type { Artifact, ArtifactStatus, ChangeLocation, Lane, TaskList } from './types.js';
import type { WorkflowSchema } from '../openspec/schema.js';
import { trackedArtifact } from '../openspec/schema.js';

/**
 * Deriving artifact status and board lane from files.
 *
 * Nothing here reads a stored status, because none exists. Given the same files,
 * these functions must always return the same answer.
 */

/**
 * Matches the limited glob vocabulary OpenSpec schemas actually use:
 * `proposal.md`, `design.md`, `specs/**\/*.md`.
 *
 * A general glob library would be more capable and less predictable. These
 * patterns come from a schema file, so the surface is small and known.
 */
export function matchesGlob(pattern: string, relativePath: string): boolean {
  const escaped = pattern
    .split('')
    .map((char) => ('\\^$.|?+()[]{}'.includes(char) ? `\\${char}` : char))
    .join('');

  const expression = escaped
    // `**/` may match nothing at all, so `specs/**/*.md` also matches `specs/a.md`.
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\*\*/g, '.*')
    // A single star never crosses a directory boundary.
    .replace(/(?<!\.)\*/g, '[^/]*');

  return new RegExp(`^${expression}$`).test(relativePath);
}

export interface ArtifactInput {
  schema: WorkflowSchema;
  /** Change-relative paths that exist, using forward slashes. */
  presentPaths: string[];
  /** Absolute path of the change root, used to build absolute artifact paths. */
  changeRoot: string;
}

function absolute(changeRoot: string, relative: string): string {
  const separator = changeRoot.includes('\\') && !changeRoot.includes('/') ? '\\' : '/';
  const native = separator === '\\' ? relative.replace(/\//g, '\\') : relative;
  return `${changeRoot}${separator}${native}`;
}

/**
 * Computes each artifact's status from which files exist.
 *
 * `done` means the file exists. OpenSpec has no notion of an artifact being
 * written badly and specdeck does not invent one, so a one-line proposal is done.
 */
export function deriveArtifacts(input: ArtifactInput): Artifact[] {
  const { schema, presentPaths, changeRoot } = input;

  const matches = new Map<string, string[]>();
  for (const artifact of schema.artifacts) {
    matches.set(
      artifact.id,
      presentPaths.filter((path) => matchesGlob(artifact.generates, path)),
    );
  }

  const done = new Set(
    schema.artifacts.filter((a) => (matches.get(a.id)?.length ?? 0) > 0).map((a) => a.id),
  );

  return schema.artifacts.map((artifact) => {
    const existing = matches.get(artifact.id) ?? [];
    const missingDeps = artifact.requires.filter((dep) => !done.has(dep));

    let status: ArtifactStatus;
    if (existing.length > 0) status = 'done';
    else if (missingDeps.length > 0) status = 'blocked';
    else status = 'ready';

    return {
      id: artifact.id,
      outputPath: artifact.generates,
      status,
      existingPaths: existing.map((relative) => absolute(changeRoot, relative)),
      missingDeps,
    };
  });
}

export interface LaneInput {
  schema: WorkflowSchema;
  artifacts: Artifact[];
  tasks: TaskList;
  location: ChangeLocation;
}

/**
 * Places a change in a lane.
 *
 * The gate between planning and implementation is the schema's tracked artifact
 * (usually `tasks.md`) and its dependencies, rather than hardcoded artifact
 * names, so a project using a custom schema still lands somewhere sensible.
 */
export function deriveLane(input: LaneInput): Lane {
  const { schema, artifacts, tasks, location } = input;

  if (location === 'archived') return 'archived';

  const byId = new Map(artifacts.map((a) => [a.id, a]));
  const isDone = (id: string): boolean => byId.get(id)?.status === 'done';

  const tracked = trackedArtifact(schema);

  if (tracked !== undefined && isDone(tracked.id)) {
    if (tasks.total === 0) return 'ready';
    if (tasks.completed === 0) return 'ready';
    if (tasks.completed >= tasks.total) return 'done';
    return 'in-progress';
  }

  const anyDone = artifacts.some((a) => a.status === 'done');
  if (!anyDone) return 'draft';

  // Everything the tracked artifact waits on is written, so planning is finished
  // and only the task list is missing.
  const gate = tracked?.requires ?? [];
  if (gate.length > 0 && gate.every(isDone)) return 'specified';

  // No tracked artifact at all: fall back to whether the whole schema is written.
  if (tracked === undefined) {
    return artifacts.every((a) => a.status === 'done') ? 'done' : 'proposed';
  }

  return 'proposed';
}
