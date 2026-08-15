import { openspecCommand, runOpenspec, type OpenspecResult } from './run.js';

/**
 * The OpenSpec commands the dashboard can run.
 *
 * Each one is a thin, named wrapper rather than a generic "run anything" hole,
 * for two reasons. The flags that keep a command non-interactive live with the
 * command instead of being remembered at each call site, and there is no path
 * by which an argument arriving in a request becomes part of an invocation.
 */

export interface ActionOutcome {
  ok: boolean;
  /** The command as a user would type it, for copying. */
  command: string;
  exitCode: number;
  /** The command's own output, unmodified. */
  output: string;
  message: string;
}

/**
 * Change names are used as path segments by OpenSpec, so anything that could
 * traverse or inject is refused before a process is spawned.
 */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isSafeName(name: string): boolean {
  return SAFE_NAME.test(name) && !name.includes('..');
}

function refuse(command: string, message: string): ActionOutcome {
  return { ok: false, command, exitCode: 1, output: '', message };
}

function report(result: OpenspecResult, success: string, failure: string): ActionOutcome {
  return {
    ok: result.ok,
    command: result.command,
    exitCode: result.code,
    output: result.output,
    message: result.ok ? success : (result.message ?? failure),
  };
}

/** Creates a change with OpenSpec's own command. */
export async function createChange(
  projectRoot: string,
  name: string,
  schema?: string,
): Promise<ActionOutcome> {
  const args = ['new', 'change', name];
  if (schema !== undefined && schema !== '' && isSafeName(schema)) args.push('--schema', schema);

  if (!isSafeName(name)) {
    return refuse(
      openspecCommand(args),
      'A change name may contain only letters, numbers, dots, dashes, and underscores.',
    );
  }

  const result = await runOpenspec(projectRoot, args);
  return report(result, `Created ${name}.`, 'The change was not created.');
}

/**
 * Refreshes a project's generated OpenSpec instruction files.
 *
 * Worth knowing: this also rewrites OpenSpec's own global configuration, which
 * it infers from the project it is pointed at. That is why it is only ever run
 * when a user asks for it, and never as part of reading a project.
 */
export async function updateInstructions(projectRoot: string): Promise<ActionOutcome> {
  const result = await runOpenspec(projectRoot, ['update', '.']);
  return report(result, 'Instruction files updated.', 'The update did not complete.');
}

/** Links a change to an initiative through OpenSpec's own metadata command. */
export async function linkInitiative(
  projectRoot: string,
  changeName: string,
  initiative: string,
  store?: string,
): Promise<ActionOutcome> {
  const args = ['set', 'change', changeName, '--initiative', initiative];
  if (store !== undefined && store !== '' && isSafeName(store)) args.push('--store', store);
  args.push('--json');

  if (!isSafeName(changeName) || !isSafeName(initiative)) {
    return refuse(openspecCommand(args), 'That change or initiative name is not one specdeck will pass to OpenSpec.');
  }

  const result = await runOpenspec(projectRoot, args);
  return report(result, `Linked ${changeName} to ${initiative}.`, 'The link was not made.');
}
