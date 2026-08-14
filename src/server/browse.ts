import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

/**
 * Opening the operating system's own folder picker.
 *
 * A browser cannot do this. `<input type="file" webkitdirectory>` hands back
 * file entries with the real absolute path deliberately stripped, which is
 * useless for a tool whose entire job is to read a folder by path.
 *
 * specdeck can do it anyway, because the server is a local process on the user's
 * own machine. That is a genuine advantage of the architecture, so it is worth
 * using rather than making people paste paths.
 */

export interface BrowseResult {
  ok: boolean;
  /** The chosen absolute path. Absent when cancelled or unsupported. */
  path?: string;
  /** True when the user dismissed the dialog, which is not an error. */
  cancelled?: boolean;
  /** Present when no picker could be used, so the caller can fall back. */
  unsupported?: boolean;
  message?: string;
}

/**
 * Builds the Windows picker script, with the start directory embedded.
 *
 * `OpenFileDialog` with name validation disabled is used rather than
 * `FolderBrowserDialog`, which under Windows PowerShell renders the old
 * tree-only dialog with no address bar. This gives the modern Explorer dialog:
 * type a path in the address bar, or navigate to the folder and press Open. It
 * returns a file inside the chosen folder, so the parent is taken.
 *
 * The directory is inlined rather than passed as an argument, because arguments
 * after `-Command` are not bound to `$args`: PowerShell appends them to the
 * command text, where they execute as a stray statement. Single quotes are
 * doubled, which is PowerShell's own escaping for a literal string.
 */
function windowsScript(startIn?: string): string {
  const initial =
    startIn === undefined || startIn === ''
      ? ''
      : `
$start = '${startIn.replace(/'/g, "''")}'
if (Test-Path -LiteralPath $start) { $dialog.InitialDirectory = $start }`;

  // No owner window is passed to ShowDialog. A hidden owner form was tried to
  // force the dialog in front, and it made ShowDialog return Cancel immediately
  // without ever displaying, because the form has no running message loop.
  // Bringing the process to the foreground is done instead, which is enough for
  // the dialog to appear over the browser.
  return `
Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName Microsoft.VisualBasic | Out-Null

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = 'Choose a project folder'
$dialog.ValidateNames = $false
$dialog.CheckFileExists = $false
$dialog.CheckPathExists = $true
$dialog.FileName = 'Open this folder'${initial}

try { [Microsoft.VisualBasic.Interaction]::AppActivate($PID) } catch { }

if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output (Split-Path -Parent $dialog.FileName)
}
`;
}

/**
 * PowerShell reads `-EncodedCommand` as base64 UTF-16LE, which removes every
 * quoting and escaping question from a multi-line script passed through argv.
 */
function encodeCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function run(
  command: string,
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: 300_000, maxBuffer: 1024 * 1024, windowsHide: false },
      (error, stdout, stderr) => {
        resolve({ ok: !error, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

function verify(path: string): BrowseResult {
  const trimmed = path.trim();
  if (trimmed === '') return { ok: false, cancelled: true };
  if (!existsSync(trimmed) || !statSync(trimmed).isDirectory()) {
    return { ok: false, message: `${trimmed} is not a folder specdeck can read.` };
  }
  return { ok: true, path: trimmed };
}

/**
 * Opens a native folder picker, blocking until the user chooses or cancels.
 *
 * Every failure resolves rather than throwing, and an environment with no picker
 * reports `unsupported` so the interface can fall back to typing a path instead
 * of simply appearing broken.
 */
export async function browseForFolder(startIn?: string): Promise<BrowseResult> {
  if (process.platform === 'win32') {
    // -STA is required: the common dialogs need a single-threaded apartment.
    //
    // -NonInteractive is deliberately absent. It suppresses interactive user
    // interface, which is precisely what a dialog is, so including it stops the
    // picker from ever appearing.
    const result = await run('powershell.exe', [
      '-NoProfile',
      '-STA',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodeCommand(windowsScript(startIn)),
    ]);

    if (result.stdout.trim() !== '') return verify(result.stdout);
    // No output and a clean exit means the user pressed Cancel.
    if (result.ok) return { ok: false, cancelled: true };
    return {
      ok: false,
      unsupported: true,
      message:
        `Could not open the Windows folder picker. ${result.stderr.trim().split('\n')[0] ?? ''}`.trim(),
    };
  }

  if (process.platform === 'darwin') {
    const script = startIn
      ? `POSIX path of (choose folder with prompt "Choose a project folder" default location POSIX file "${startIn}")`
      : 'POSIX path of (choose folder with prompt "Choose a project folder")';
    const result = await run('osascript', ['-e', script]);
    // Cancelling osascript exits non-zero with a "User canceled" message.
    if (!result.ok) {
      if (/User canceled/i.test(result.stderr)) return { ok: false, cancelled: true };
      return { ok: false, unsupported: true, message: 'Could not open the macOS folder picker.' };
    }
    return verify(result.stdout);
  }

  for (const [command, args] of [
    ['zenity', ['--file-selection', '--directory', '--title=Choose a project folder']],
    ['kdialog', ['--getexistingdirectory', startIn ?? '.']],
  ] as Array<[string, string[]]>) {
    const result = await run(command, args);
    if (result.ok) return verify(result.stdout);
    // A cancel and a missing binary both exit non-zero, so only treat output as
    // meaningful and otherwise try the next tool.
    if (result.stdout.trim() !== '') return verify(result.stdout);
  }

  return {
    ok: false,
    unsupported: true,
    message: 'No folder picker is available here. Install zenity or kdialog, or type the path.',
  };
}
