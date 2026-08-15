import { openspecCommand, parseJsonOutput, runOpenspec, type OpenspecResult } from './run.js';

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

/**
 * Gathers what the user needs to see before archiving.
 */
export async function preflightArchive(
  projectRoot: string,
  changeName: string,
  completedTasks: number,
  totalTasks: number,
): Promise<ArchivePreflight> {
  const preflight: ArchivePreflight = {
    changeName,
    incompleteTasks: Math.max(0, totalTasks - completedTasks),
    totalTasks,
    validationIssues: [],
    valid: true,
    command: archiveCommand(changeName),
  };

  const result = await runOpenspec(projectRoot, ['validate', changeName, '--json']);

  // Validation output that cannot be read is not a reason to block. The task
  // counts alone are enough for the user to decide.
  const parsed = parseJsonOutput<{ items?: Array<{ valid?: unknown; issues?: unknown }> }>(
    result.output,
  );

  for (const item of parsed?.items ?? []) {
    if (item.valid === false) preflight.valid = false;
    if (!Array.isArray(item.issues)) continue;
    for (const issue of item.issues) {
      preflight.validationIssues.push(typeof issue === 'string' ? issue : JSON.stringify(issue));
    }
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
  const result = await runOpenspec(projectRoot, archiveArgs(changeName));

  return {
    ok: result.ok,
    command: result.command,
    exitCode: result.code,
    output: result.output,
    message: result.ok ? `Archived ${changeName}.` : failureMessage(result),
  };
}

/**
 * Explains an archive failure without overstating what is known.
 *
 * A command that never ran definitely changed nothing. A command killed partway
 * through might have merged some specs already, and saying otherwise would be a
 * confident lie about the one action that cannot be undone.
 */
function failureMessage(result: OpenspecResult): string {
  if (result.failure === 'missing-openspec') {
    return result.message ?? 'specdeck could not find its bundled copy of OpenSpec.';
  }
  if (result.failure === 'timeout') {
    return `${result.message ?? 'The archive was stopped before it finished.'} It may have partly completed, so check the change before running it again.`;
  }
  return 'The archive did not complete. Nothing else was changed.';
}

function archiveArgs(changeName: string): string[] {
  return ['archive', changeName, '-y'];
}

/** The command specdeck would run, for the user to copy and run instead. */
export function archiveCommand(changeName: string): string {
  return openspecCommand(archiveArgs(changeName));
}
