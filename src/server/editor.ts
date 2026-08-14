import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Opening a file in the user's editor.
 *
 * Tries the editor the user has configured before falling back to whatever the
 * operating system associates with the file type. The fallback matters: on a
 * machine with no `EDITOR` set, opening a markdown file in the default handler
 * is still far better than a dead button.
 */

export interface OpenOutcome {
  ok: boolean;
  message: string;
}

function spawn(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = execFile(command, args, { windowsHide: true }, () => undefined);
    // Editors are long lived. Success here means the process started, not that
    // it exited, so the server must not wait on it or hold a handle open.
    child.on('error', () => resolve(false));
    child.unref();
    setTimeout(() => resolve(true), 250);
  });
}

export async function openInEditor(path: string): Promise<OpenOutcome> {
  if (!existsSync(path)) {
    return { ok: false, message: `${path} no longer exists.` };
  }

  const configured = process.env.SPECDECK_EDITOR ?? process.env.VISUAL ?? process.env.EDITOR;
  if (configured !== undefined && configured.trim() !== '') {
    // A configured editor may include arguments, for example "code --wait".
    const parts = configured.trim().split(/\s+/);
    const command = parts[0];
    if (command !== undefined) {
      if (await spawn(command, [...parts.slice(1), path])) {
        return { ok: true, message: `Opened in ${command}.` };
      }
    }
  }

  if (process.platform === 'win32') {
    // `start` is a shell builtin, so it is reached through cmd. The empty string
    // is the window title argument, which `start` requires before the path when
    // the path might be quoted.
    if (await spawn('cmd.exe', ['/c', 'start', '', path])) {
      return { ok: true, message: 'Opened in your default editor.' };
    }
  } else if (process.platform === 'darwin') {
    if (await spawn('open', [path])) return { ok: true, message: 'Opened in your default editor.' };
  } else if (await spawn('xdg-open', [path])) {
    return { ok: true, message: 'Opened in your default editor.' };
  }

  return {
    ok: false,
    message: 'Could not open an editor. Set the EDITOR environment variable and try again.',
  };
}
