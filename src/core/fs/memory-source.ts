import type { DirEntry, FileSource, FileStat } from './source.js';

/**
 * An in-memory `FileSource`, built from a flat map of path to content.
 *
 * This exists for two reasons. The obvious one is that parser tests should not
 * need a temporary directory to assert on markdown handling.
 *
 * The less obvious one is that it is the seam's proof of work. An interface with
 * a single implementation is an assertion nobody has checked. A second
 * implementation that behaves identically under the same tests is evidence the
 * abstraction actually holds, which is what makes adding a git-backed or
 * clone-backed source later a contained change rather than an excavation.
 */
export class MemoryFileSource implements FileSource {
  readonly id: string;

  private readonly files: Map<string, string>;
  private readonly directories: Set<string>;
  private readonly modifiedAt: Date;

  /**
   * @param files Map of absolute path to file content. Parent directories are
   *   inferred, so only files need listing.
   * @param options.separator Path separator these paths use. Defaults to `/`.
   */
  constructor(
    files: Record<string, string>,
    options: { id?: string; separator?: string; modifiedAt?: Date } = {},
  ) {
    this.id = options.id ?? 'memory';
    this.separator = options.separator ?? '/';
    this.modifiedAt = options.modifiedAt ?? new Date(0);
    this.files = new Map(Object.entries(files));
    this.directories = new Set();

    for (const path of this.files.keys()) {
      let parent = this.parentOf(path);
      while (parent !== undefined && !this.directories.has(parent)) {
        this.directories.add(parent);
        parent = this.parentOf(parent);
      }
    }
  }

  private readonly separator: string;

  private parentOf(path: string): string | undefined {
    const index = path.lastIndexOf(this.separator);
    if (index <= 0) return undefined;
    return path.slice(0, index);
  }

  private childName(parent: string, path: string): string | undefined {
    const prefix = parent.endsWith(this.separator) ? parent : `${parent}${this.separator}`;
    if (!path.startsWith(prefix)) return undefined;
    const rest = path.slice(prefix.length);
    if (rest === '') return undefined;
    const cut = rest.indexOf(this.separator);
    return cut === -1 ? rest : rest.slice(0, cut);
  }

  readText(path: string): Promise<string | undefined> {
    return Promise.resolve(this.files.get(path));
  }

  list(path: string): Promise<DirEntry[] | undefined> {
    if (!this.directories.has(path)) return Promise.resolve(undefined);

    const names = new Map<string, DirEntry>();

    for (const filePath of this.files.keys()) {
      const name = this.childName(path, filePath);
      if (name === undefined) continue;
      const fullChild = `${path}${this.separator}${name}`;
      names.set(name, { name, kind: this.files.has(fullChild) ? 'file' : 'directory' });
    }

    return Promise.resolve([...names.values()].sort((a, b) => a.name.localeCompare(b.name)));
  }

  stat(path: string): Promise<FileStat | undefined> {
    const content = this.files.get(path);
    if (content !== undefined) {
      return Promise.resolve({
        size: Buffer.byteLength(content, 'utf8'),
        modifiedAt: this.modifiedAt,
      });
    }
    if (this.directories.has(path)) {
      return Promise.resolve({ size: 0, modifiedAt: this.modifiedAt });
    }
    return Promise.resolve(undefined);
  }
}
