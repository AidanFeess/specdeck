/**
 * The single seam through which every read passes.
 *
 * Today there is exactly one implementation, backed by the local filesystem.
 * The interface exists anyway because the alternative is retrofitting it later,
 * once parsers have grown direct `node:fs` calls throughout.
 *
 * The concrete future sources this is shaped for:
 *
 *   - a cached sparse clone, for repositories the user has not checked out
 *   - git object reads, for showing a capability as it exists on another ref
 *
 * Both supply bytes for a path and a listing for a directory, which is all a
 * parser needs. Neither can offer synchronous access, which is why every method
 * here is asynchronous even though the local implementation need not be.
 *
 * Path convention: callers pass absolute paths in the host's native form. A
 * source that is not the local filesystem is constructed rooted at a base
 * directory and translates internally, so callers never deal in two path styles.
 */

export type EntryKind = 'file' | 'directory' | 'other';

export interface DirEntry {
  /** Base name only, not a path. */
  name: string;
  kind: EntryKind;
}

export interface FileStat {
  size: number;
  /**
   * Last modification time.
   *
   * Treated as a weak signal throughout specdeck. It does not survive a clone
   * and is reordered by branch checkouts, so it is only ever a fallback for git
   * history, never a substitute.
   */
  modifiedAt: Date;
}

/**
 * A read-only view of a tree.
 *
 * Absence is not an error. Every method resolves to `undefined` when the target
 * does not exist, because in an OpenSpec tree a missing file is the normal way
 * of expressing that an artifact has not been written yet. Methods reject only
 * on genuine I/O failures such as a permission error, which the caller should
 * surface rather than silently treat as absence.
 */
export interface FileSource {
  /** Identifies this source in diagnostics, for example "local" or "git:origin/main". */
  readonly id: string;

  /** Reads a file as UTF-8. Resolves to undefined when it does not exist. */
  readText(path: string): Promise<string | undefined>;

  /** Lists a directory. Resolves to undefined when it does not exist. */
  list(path: string): Promise<DirEntry[] | undefined>;

  /** Stats a path. Resolves to undefined when it does not exist. */
  stat(path: string): Promise<FileStat | undefined>;
}

/** Convenience check built on `stat`. */
export async function exists(source: FileSource, path: string): Promise<boolean> {
  return (await source.stat(path)) !== undefined;
}

/** Whether a path exists and is a directory. */
export async function isDirectory(source: FileSource, path: string): Promise<boolean> {
  return (await source.list(path)) !== undefined;
}

export interface WalkOptions {
  /**
   * Maximum directory depth to descend. Depth 0 lists only the root.
   *
   * Bounded by default because an OpenSpec tree is shallow, and an unbounded
   * walk that wanders into `node_modules` would be a serious performance bug.
   */
  maxDepth?: number;
  /** Return false to skip a directory and everything under it. */
  includeDirectory?: (relativePath: string, entry: DirEntry) => boolean;
  /** Return false to omit a file from the results. */
  includeFile?: (relativePath: string, entry: DirEntry) => boolean;
}

export interface WalkedFile {
  /** Absolute path in the source's path style. */
  path: string;
  /** Path relative to the walk root, always using forward slashes. */
  relativePath: string;
  entry: DirEntry;
}

/**
 * Recursively lists files under a root.
 *
 * Built on `list` rather than added to the interface, so a new source only has
 * to implement three methods to get walking for free.
 *
 * Relative paths use forward slashes regardless of host, so that callers can
 * pattern match without branching on platform. Absolute paths stay native.
 */
export async function walkFiles(
  source: FileSource,
  root: string,
  options: WalkOptions = {},
): Promise<WalkedFile[]> {
  const maxDepth = options.maxDepth ?? 8;
  const results: WalkedFile[] = [];

  async function descend(absolute: string, relative: string, depth: number): Promise<void> {
    const entries = await source.list(absolute);
    if (entries === undefined) return;

    for (const entry of entries) {
      const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
      const childAbsolute = joinNative(absolute, entry.name);

      if (entry.kind === 'directory') {
        if (depth >= maxDepth) continue;
        if (options.includeDirectory && !options.includeDirectory(childRelative, entry)) continue;
        await descend(childAbsolute, childRelative, depth + 1);
        continue;
      }

      if (entry.kind !== 'file') continue;
      if (options.includeFile && !options.includeFile(childRelative, entry)) continue;
      results.push({ path: childAbsolute, relativePath: childRelative, entry });
    }
  }

  await descend(root, '', 0);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

/**
 * Joins a directory and a child name using the separator already present in the
 * parent path.
 *
 * `node:path.join` is not used here because this module must stay usable by
 * sources whose paths are not host paths.
 */
function joinNative(directory: string, name: string): string {
  if (directory === '') return name;
  const separator = directory.includes('\\') && !directory.includes('/') ? '\\' : '/';
  return directory.endsWith(separator) ? `${directory}${name}` : `${directory}${separator}${name}`;
}
