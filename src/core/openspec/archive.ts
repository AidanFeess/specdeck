import { execFile } from 'node:child_process';

import { findBundledOpenSpecRoot } from './installed.js';
import { joinPath } from '../fs/pathutil.js';

/**
 * Archiving a change, and checking first whether that is a good idea.
 *
 * Archiving is the only genuinely destructive thing specdeck can do. It merges
 * delta specs into the main specs and moves the change directory, and OpenSpec
 * has no unarchive command, so the only way back is git. It also archives
 * happily with unfinished tasks when run non-interactively, warning and
 * continuing rather than stopping.
 *
 * So the preflight below exists to put in front of the user exactly what the
 * interactive CLI would have asked them, before anything runs.
 */

export interface ArchivePreflight {
  changeName: string;
  incompleteTasks: number;
  totalTasks: number;
  /** Validation output from OpenSpec, when it reported problems. */
  validationIssues: string[];
  valid: boolean;
  /** The command specdeck would run, for copying. */
  command: string;
}

export interface ArchiveOutcome {
  ok: boolean;
  command: string;
  exitCode: number;
  output: string;
  message: string;
}

function openspecArgs(packageRoot: string, args: string[]): { binary: string; argv: string[] } {
  return { binary: process.execPath, argv: [joinPath(packageRoot, 'bin', 'openspec.js'), ...args] };
}

function run(
  cwd: string,
  binary: string,
  argv: string[],
): Promise<{ ok: boolean; code: number; output: string }> {
  return new Promise((resolve) => {
    execFile(
      binary,
      argv,
      {
        cwd,
        timeout: 120_000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      },
      (error, stdout, stderr) => {
        const output = `${stdout}${stderr}`.trim();
        const code =
          error && typeof (error as { code?: unknown }).code === 'number'
            ? (error as { code: number }).code
            : error
              ? 1
              : 0;
        resolve({ ok: !error, code, output });
      },
    );
  });
}

/**
 * Gathers what the user needs to see before archiving.
 */
export async function preflightArchive(
  projectRoot: string,
  changeName: string,
  completedTasks: number,
  totalTasks: number,
): Promise<ArchivePreflight> {
  const command = `openspec archive ${changeName} -y`;
  const preflight: ArchivePreflight = {
    changeName,
    incompleteTasks: Math.max(0, totalTasks - completedTasks),
    totalTasks,
    validationIssues: [],
    valid: true,
    command,
  };

  const packageRoot = findBundledOpenSpecRoot();
  if (packageRoot === undefined) return preflight;

  const { binary, argv } = openspecArgs(packageRoot, ['validate', changeName, '--json']);
  const result = await run(projectRoot, binary, argv);

  try {
    const start = result.output.indexOf('{');
    if (start === -1) return preflight;
    const parsed: unknown = JSON.parse(result.output.slice(start));
    const items = (parsed as { items?: Array<{ valid?: unknown; issues?: unknown }> }).items ?? [];
    for (const item of items) {
      if (item.valid === false) preflight.valid = false;
      if (Array.isArray(item.issues)) {
        for (const issue of item.issues) {
          preflight.validationIssues.push(
            typeof issue === 'string' ? issue : JSON.stringify(issue),
          );
        }
      }
    }
  } catch {
    // Validation output that cannot be parsed is not a reason to block. The
    // task counts alone are enough for the user to decide.
  }

  return preflight;
}

/**
 * Runs the archive.
 *
 * `-y` is required because the command is interactive otherwise and would hang
 * forever inside a web server. The confirmation the flag skips is exactly what
 * the preflight puts in the interface instead, so nothing is hidden, it is just
 * asked somewhere the user can actually answer.
 */
export async function archiveChange(
  projectRoot: string,
  changeName: string,
): Promise<ArchiveOutcome> {
  const command = `openspec archive ${changeName} -y`;
  const packageRoot = findBundledOpenSpecRoot();

  if (packageRoot === undefined) {
    return {
      ok: false,
      command,
      exitCode: 1,
      output: '',
      message: 'specdeck could not find its bundled copy of OpenSpec. Run the command yourself.',
    };
  }

  const { binary, argv } = openspecArgs(packageRoot, ['archive', changeName, '-y']);
  const result = await run(projectRoot, binary, argv);

  return {
    ok: result.ok,
    command,
    exitCode: result.code,
    output: result.output,
    message: result.ok
      ? `Archived ${changeName}.`
      : 'The archive did not complete. Nothing else was changed.',
  };
}
