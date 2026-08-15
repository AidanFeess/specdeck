import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

/**
 * Reading and writing whole artifacts.
 *
 * This generalizes what `toggle-task.ts` does for a single line. The conflict it
 * guards against is the same and just as common: an agent may be rewriting the
 * file while a user edits it in the browser. A write whose base no longer
 * matches what is on disk is refused rather than merged, because merging would
 * mean silently choosing whose work to lose.
 *
 * The guard is a content hash rather than a modification time. Mtime resolution
 * is coarse enough that an agent can rewrite a file inside one tick, and a
 * clock that moves backwards would make it worse.
 */

/** Hash identifying an artifact's exact bytes. */
export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('base64url').slice(0, 22);
}

export interface ArtifactContent {
  path: string;
  text: string;
  /** Passed back on save to prove the edit was based on these bytes. */
  hash: string;
}

export type ReadArtifactOutcome =
  { ok: true; artifact: ArtifactContent } | { ok: false; reason: 'missing'; message: string };

export async function readArtifact(path: string): Promise<ReadArtifactOutcome> {
  try {
    const text = await readFile(path, 'utf8');
    return { ok: true, artifact: { path, text, hash: hashContent(text) } };
  } catch (error) {
    return {
      ok: false,
      reason: 'missing',
      message: `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export type WriteArtifactOutcome =
  | { ok: true; hash: string }
  | { ok: false; reason: 'missing'; message: string }
  | { ok: false; reason: 'conflict'; message: string; current: ArtifactContent }
  | { ok: false; reason: 'failed'; message: string };

/**
 * Writes an artifact, but only if it still holds the content the edit began
 * from.
 *
 * On conflict the file on disk is returned alongside the refusal, so the
 * interface can show what changed instead of only reporting that something did.
 * The caller keeps the user's text either way: losing an edit to protect
 * against losing an edit would be a poor trade.
 */
export async function writeArtifact(
  path: string,
  text: string,
  baseHash: string,
): Promise<WriteArtifactOutcome> {
  const current = await readArtifact(path);
  if (!current.ok) return { ok: false, reason: 'missing', message: current.message };

  if (current.artifact.hash !== baseHash) {
    return {
      ok: false,
      reason: 'conflict',
      message:
        'This file changed on disk since you started editing, so nothing was written. ' +
        'Your text is still here.',
      current: current.artifact,
    };
  }

  try {
    await writeFile(path, text, 'utf8');
    return { ok: true, hash: hashContent(text) };
  } catch (error) {
    return {
      ok: false,
      reason: 'failed',
      message: `Could not write ${path}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
