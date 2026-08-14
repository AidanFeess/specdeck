import chokidar, { type FSWatcher } from 'chokidar';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Filesystem watching with burst coalescing.
 *
 * This is the only thing that ever moves a card, so two properties matter more
 * than latency:
 *
 * 1. **Never render mid mutation.** `openspec archive` deletes a change
 *    directory and recreates it elsewhere. Read halfway through, the change
 *    derives cleanly to an earlier lane, so the card visibly flickers backwards
 *    and then vanishes. Nothing errors. It just looks broken. Events are
 *    therefore coalesced until the filesystem has been quiet.
 *
 * 2. **Failure must be observable.** A missed event is indistinguishable from an
 *    idle board, so a reconcile timer recomputes regardless of events and the
 *    interface shows how long ago the last scan completed.
 */

export const QUIET_PERIOD_MS = 300;
export const RECONCILE_INTERVAL_MS = 10_000;

export interface WatchHandle {
  close(): Promise<void>;
}

export interface WatchOptions {
  /** Fired after the filesystem has been quiet, and on the reconcile timer. */
  onChange: (reason: 'watch' | 'reconcile') => void;
  quietPeriodMs?: number;
  reconcileIntervalMs?: number;
}

/**
 * Watches a project's OpenSpec tree and the git state that affects sync.
 *
 * The git paths are watched because committing, switching branches, and fetching
 * change what the board should show but touch nothing inside `openspec/`.
 */
/**
 * Resolves a path to its canonical on-disk form.
 *
 * This is not tidiness. On Windows, libuv asserts inside its filesystem event
 * code when the path it is watching does not case-match the names the operating
 * system reports, and an assertion is not an exception: it aborts the process.
 * Short-name and casing variants of a directory are common, particularly under
 * the temp directory, so a user whose project path happens to differ in case
 * would take the whole server down rather than see an error.
 *
 * Falls back to the original path when the target does not exist yet, which the
 * watcher tolerates on its own.
 */
function canonical(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

export function watchProject(rawProjectRoot: string, options: WatchOptions): WatchHandle {
  const projectRoot = canonical(rawProjectRoot);
  const quiet = options.quietPeriodMs ?? QUIET_PERIOD_MS;
  const reconcileEvery = options.reconcileIntervalMs ?? RECONCILE_INTERVAL_MS;

  const targets = [
    join(projectRoot, 'openspec'),
    join(projectRoot, '.git', 'HEAD'),
    join(projectRoot, '.git', 'index'),
    join(projectRoot, '.git', 'refs'),
    join(projectRoot, '.git', 'FETCH_HEAD'),
  ];

  let timer: NodeJS.Timeout | undefined;

  const watcher: FSWatcher = chokidar.watch(targets, {
    ignoreInitial: true,
    // Watching a repository must never wander into build output.
    ignored: (path: string) => /(?:^|[\\/])(?:node_modules|dist|coverage)(?:[\\/]|$)/.test(path),
  });

  const schedule = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      options.onChange('watch');
    }, quiet);
  };

  watcher.on('all', schedule);
  // A watcher error must not take the process down. The reconcile timer keeps
  // the board correct, just less promptly.
  watcher.on('error', () => undefined);

  const reconcile = setInterval(() => options.onChange('reconcile'), reconcileEvery);

  return {
    async close(): Promise<void> {
      if (timer !== undefined) clearTimeout(timer);
      clearInterval(reconcile);
      await watcher.close();
    },
  };
}
