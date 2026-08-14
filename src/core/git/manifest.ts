import { git, splitNul } from './run.js';

/**
 * The manifest seam: a reference mapped to path and blob hash.
 *
 * This is deliberately the shape a future non-local source would also produce.
 * GitHub's tree endpoint and a cached sparse clone both return the same 40
 * character git blob hashes, so comparison is hash equality rather than content
 * diffing, and any future source plugs in behind a state machine that is already
 * finished.
 */

export interface Manifest {
  ok: boolean;
  reason?: string;
  /** Repository-relative path, forward slashes, to its 40 character blob hash. */
  entries: Map<string, string>;
  /** Paths skipped because they are not blobs, kept for diagnostics. */
  skipped: string[];
}

/**
 * Lists every blob under a path at a given reference.
 *
 * Two details matter more than they look:
 *
 * Submodules appear in a tree listing as mode 160000 gitlinks whose hash is a
 * commit, not a blob. Including them would compare a commit hash against a file
 * hash forever, so they are filtered by mode rather than by path. A submodule's
 * own OpenSpec directory is invisible from the parent repository regardless, and
 * belongs to that submodule as its own project.
 *
 * Path spelling comes from git and is treated as canonical. Tree pathspecs are
 * case sensitive even on Windows, and `--icase-pathspecs` is not supported, so
 * building a pathspec from filesystem-derived case silently returns nothing on a
 * capability whose directory differs only in case. One unfiltered listing is
 * taken instead and filtering happens in memory.
 */
export async function readManifest(
  projectRoot: string,
  ref: string,
  pathPrefix = 'openspec',
): Promise<Manifest> {
  const result = await git(['ls-tree', '-r', '-z', ref, '--', pathPrefix], { cwd: projectRoot });

  if (!result.ok) {
    return {
      ok: false,
      reason: (result.stderr || result.stdout).trim().split('\n')[0] ?? 'ls-tree failed',
      entries: new Map(),
      skipped: [],
    };
  }

  const entries = new Map<string, string>();
  const skipped: string[] = [];

  for (const record of splitNul(result.stdout)) {
    // `<mode> SP <type> SP <hash> TAB <path>`
    const tab = record.indexOf('\t');
    if (tab === -1) continue;

    const meta = record.slice(0, tab).split(/\s+/);
    const mode = meta[0];
    const type = meta[1];
    const hash = meta[2];
    const path = record.slice(tab + 1).replace(/\\/g, '/');

    if (path === '' || hash === undefined) continue;

    // Gitlinks are mode 160000 with type "commit".
    if (type !== 'blob' || mode === '160000') {
      skipped.push(path);
      continue;
    }

    entries.set(path, hash);
  }

  return { ok: true, entries, skipped };
}

export type ManifestDiff = {
  /** Present in `left` only. */
  onlyLeft: string[];
  /** Present in `right` only. */
  onlyRight: string[];
  /** Present in both, different hashes. */
  differing: string[];
  /** Present in both with identical hashes. */
  identical: string[];
};

/**
 * Compares two manifests by hash.
 *
 * Identical hashes mean identical content, with no file reads at all. That is
 * what makes this cheap enough to run against a remote source later.
 */
export function diffManifests(left: Manifest, right: Manifest): ManifestDiff {
  const onlyLeft: string[] = [];
  const onlyRight: string[] = [];
  const differing: string[] = [];
  const identical: string[] = [];

  for (const [path, hash] of left.entries) {
    const other = right.entries.get(path);
    if (other === undefined) onlyLeft.push(path);
    else if (other === hash) identical.push(path);
    else differing.push(path);
  }

  for (const path of right.entries.keys()) {
    if (!left.entries.has(path)) onlyRight.push(path);
  }

  return {
    onlyLeft: onlyLeft.sort(),
    onlyRight: onlyRight.sort(),
    differing: differing.sort(),
    identical: identical.sort(),
  };
}
