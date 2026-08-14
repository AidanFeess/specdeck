import { readFile, writeFile } from 'node:fs/promises';

import { toggleTaskLine } from '../parse/tasks.js';

/**
 * The only file specdeck ever writes inside a project.
 *
 * `tasks.md` is a file OpenSpec owns with a defined format, and ticking a
 * checkbox is the one mutation both derived-board tools converged on as safe.
 *
 * The conflict this guards against is real and common: an agent may be
 * rewriting the same file while the user clicks. The line is therefore verified
 * against the text the user believed they were toggling, and a mismatch is
 * refused rather than merged. The board is push-derived, so the checkbox does
 * not move until the watcher observes the write, which means a refused write
 * simply leaves the box where it was.
 */

export type ToggleOutcome =
  | { ok: true }
  | { ok: false; reason: 'missing'; message: string }
  | { ok: false; reason: 'conflict'; message: string }
  | { ok: false; reason: 'failed'; message: string };

export async function toggleTask(
  tasksPath: string,
  line: number,
  expectedText: string,
  completed: boolean,
): Promise<ToggleOutcome> {
  let content: string;
  try {
    content = await readFile(tasksPath, 'utf8');
  } catch (error) {
    return {
      ok: false,
      reason: 'missing',
      message: `Could not read ${tasksPath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const updated = toggleTaskLine(content, line, expectedText, completed);
  if (updated === undefined) {
    return {
      ok: false,
      reason: 'conflict',
      message:
        'That task changed on disk since the board last read it, so nothing was written. ' +
        'The board will catch up in a moment.',
    };
  }

  try {
    await writeFile(tasksPath, updated, 'utf8');
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: 'failed',
      message: `Could not write ${tasksPath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
