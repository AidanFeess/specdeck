/**
 * Path joining that follows the style of the path it is given.
 *
 * `node:path.join` is not usable here. It emits the host separator, so on
 * Windows it turns a POSIX-style path from a non-local `FileSource` into a mixed
 * path that no longer resolves. Since the whole point of the source seam is that
 * a source need not be the local filesystem, path handling has to follow the
 * data rather than the host.
 */

export function separatorOf(path: string): '\\' | '/' {
  return path.includes('\\') && !path.includes('/') ? '\\' : '/';
}

export function joinPath(base: string, ...parts: string[]): string {
  if (parts.length === 0) return base;
  const separator = separatorOf(base);
  const trimmed = base.endsWith(separator) ? base.slice(0, -1) : base;
  const tail = parts
    .flatMap((part) => part.split(/[\\/]+/))
    .filter((part) => part !== '')
    .join(separator);
  return tail === '' ? trimmed : `${trimmed}${separator}${tail}`;
}

/** Last segment of a path, with either separator. */
export function baseName(path: string): string {
  const cleaned = path.replace(/[\\/]+$/, '');
  const index = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
  return index === -1 ? cleaned : cleaned.slice(index + 1);
}

/** Converts a path to forward slashes, for matching and display. */
export function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}
