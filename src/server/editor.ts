import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Opening a document in a chosen application.
 *
 * The caller supplies the choice. specdeck no longer infers one, because
 * inferring produced the worst possible outcome: on a machine with no file
 * association for markdown and no editor environment variable, the file was
 * handed to the operating system, nothing appeared, and nothing was reported.
 */

export interface OpenOutcome {
  ok: boolean;
  message: string;
  /** What was actually attempted, so a failure is reproducible by hand. */
  attempted?: string;
  /** True when the chosen application could not be launched at all. */
  launchFailed?: boolean;
}

/** `system` hands the file to the operating system's own handler. */
export type EditorChoice =
  { kind: 'system' } | { kind: 'command'; command: string; args?: string[] };

function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    // Editors are long lived, so success means the process started rather than
    // exited. A launch failure arrives asynchronously, hence the short wait.
    setTimeout(() => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    }, 300);
  });
}

/**
 * Asks the operating system to open the file.
 *
 * On Windows this fails silently when nothing is associated with the file type,
 * which is the default for markdown, so the association is checked first and a
 * missing one is reported rather than discovered as nothing happening.
 */
async function openWithSystem(path: string): Promise<OpenOutcome> {
  if (process.platform === 'win32') {
    const extension = path.slice(path.lastIndexOf('.'));
    const associated = await new Promise<boolean>((resolve) => {
      execFile('cmd.exe', ['/c', 'assoc', extension], { windowsHide: true }, (error) =>
        resolve(!error),
      );
    });

    if (!associated) {
      return {
        ok: false,
        attempted: `system default for ${extension}`,
        message:
          `Windows has no application associated with ${extension} files, so the system ` +
          'default cannot open this. Choose an editor instead.',
      };
    }

    try {
      await spawnDetached('cmd.exe', ['/c', 'start', '', path]);
      return { ok: true, attempted: 'system default', message: 'Opened with your system default.' };
    } catch (error) {
      return {
        ok: false,
        launchFailed: true,
        attempted: 'system default',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    await spawnDetached(command, [path]);
    return { ok: true, attempted: command, message: 'Opened with your system default.' };
  } catch (error) {
    return {
      ok: false,
      launchFailed: true,
      attempted: command,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Opens a document with an explicit choice.
 *
 * A launch failure is reported with what was attempted and flagged, so the
 * caller can reopen the picker rather than leaving a remembered application
 * that silently does nothing.
 */
export async function openInEditor(path: string, choice: EditorChoice): Promise<OpenOutcome> {
  if (!existsSync(path)) {
    return { ok: false, message: `${path} no longer exists.` };
  }

  if (choice.kind === 'system') return openWithSystem(path);

  const args = [...(choice.args ?? []), path];
  const attempted = `${choice.command} ${args.join(' ')}`.trim();

  try {
    await spawnDetached(choice.command, args);
    return { ok: true, attempted, message: `Opened in ${choice.command}.` };
  } catch (error) {
    return {
      ok: false,
      launchFailed: true,
      attempted,
      message:
        `Could not launch ${choice.command}. ` +
        (error instanceof Error ? error.message : String(error)),
    };
  }
}
