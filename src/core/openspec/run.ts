import { execFile } from 'node:child_process';

import { findBundledOpenSpecRoot } from './installed.js';
import { joinPath } from '../fs/pathutil.js';

/**
 * The one place specdeck runs OpenSpec.
 *
 * Every OpenSpec invocation goes through here, and a test asserts that no other
 * module spawns the CLI. That matters because the things easy to get wrong are
 * the same every time: forgetting the flag that stops a command prompting,
 * paraphrasing a failure instead of showing it, or reporting the internal
 * `node .../bin/openspec.js` invocation to a user who wants to reproduce it.
 *
 * The bundled binary is used rather than whatever is on PATH, so a user who has
 * never installed OpenSpec can still use every action.
 */

export type OpenspecFailure =
  /** The bundled package could not be located. Nothing was spawned. */
  | 'missing-openspec'
  /** The command was still running at the time limit and was terminated. */
  | 'timeout'
  /** The command ran and exited non-zero. */
  | 'exit';

export interface OpenspecResult {
  ok: boolean;
  /**
   * The command in the form a user would type it, for copying into a terminal.
   *
   * Deliberately not the invocation that actually ran. A failure a user cannot
   * reproduce by hand is a dead end, and `node /long/path/bin/openspec.js` is
   * not something anyone can act on.
   */
  command: string;
  code: number;
  stdout: string;
  stderr: string;
  /** Both streams together, trimmed. What a failure report shows. */
  output: string;
  failure?: OpenspecFailure;
  /** Explains the failure, written for someone reading it in the interface. */
  message?: string;
}

export interface RunOptions {
  /**
   * Terminates the command when it has not exited in time.
   *
   * A backstop, not the primary defence: stdin is closed below so a command that
   * tries to prompt fails immediately rather than waiting out the whole limit.
   */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/** Renders an argument list as the command a user would type. */
export function openspecCommand(args: string[]): string {
  return ['openspec', ...args.map(quote)].join(' ');
}

function quote(arg: string): string {
  if (arg === '') return '""';
  return /[\s"'\\]/.test(arg) ? `"${arg.replace(/(["\\])/g, '\\$1')}"` : arg;
}

/**
 * Runs an OpenSpec command in a project.
 *
 * Never throws. Every failure mode is a result, because each one has something
 * specific to tell the user and an exception would flatten them all into one.
 */
export function runOpenspec(
  projectRoot: string,
  args: string[],
  options: RunOptions = {},
): Promise<OpenspecResult> {
  const command = openspecCommand(args);
  const packageRoot = findBundledOpenSpecRoot();

  // Reported without spawning anything, so the caller can offer the command
  // rather than a failure the user has no way to act on.
  if (packageRoot === undefined) {
    return Promise.resolve({
      ok: false,
      command,
      code: 1,
      stdout: '',
      stderr: '',
      output: '',
      failure: 'missing-openspec',
      message:
        'specdeck could not find its bundled copy of OpenSpec. Run the command yourself instead.',
    });
  }

  const binary = joinPath(packageRoot, 'bin', 'openspec.js');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [binary, ...args],
      {
        cwd: projectRoot,
        timeout: timeoutMs,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
        // Colour codes would reach the browser as escape sequences.
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      },
      (error, stdout, stderr) => {
        const output = `${stdout}${stderr}`.trim();

        if (!error) {
          resolve({ ok: true, command, code: 0, stdout, stderr, output });
          return;
        }

        // A command killed by the timeout carries a signal rather than an exit
        // code. Reporting that as a generic failure would send the user looking
        // for a bug in output that was never produced.
        const killed = error.killed === true || typeof error.signal === 'string';
        if (killed) {
          resolve({
            ok: false,
            command,
            code: 1,
            stdout,
            stderr,
            output,
            failure: 'timeout',
            message: `The command did not finish within ${Math.round(timeoutMs / 1000)} seconds and was stopped.`,
          });
          return;
        }

        const code = typeof error.code === 'number' ? error.code : 1;
        resolve({
          ok: false,
          command,
          code,
          stdout,
          stderr,
          output: output === '' ? error.message : output,
          failure: 'exit',
          message: `The command exited with status ${code}.`,
        });
      },
    );

    // Closing stdin turns a prompt into an immediate failure instead of a hang.
    // Without this, an interactive command blocks until the timeout, and a
    // two-minute pause inside a web request is indistinguishable from a crash.
    child.stdin?.end();
  });
}

/**
 * Parses JSON from command output that may be preceded by progress lines.
 *
 * OpenSpec prints status text before its JSON on some commands, so the payload
 * cannot be assumed to start at the first byte. Returns undefined rather than
 * throwing: unparseable output is a degraded signal the caller reports, not a
 * reason to fail the action that produced it.
 */
export function parseJsonOutput<T>(output: string): T | undefined {
  const candidates = [output.indexOf('{'), output.indexOf('[')].filter((index) => index !== -1);
  if (candidates.length === 0) return undefined;

  const start = Math.min(...candidates);
  const end = endOfValue(output, start);
  if (end === -1) return undefined;

  try {
    return JSON.parse(output.slice(start, end)) as T;
  } catch {
    return undefined;
  }
}

/**
 * Index just past the JSON value beginning at `start`.
 *
 * Slicing to the end of the output is not enough. OpenSpec writes a telemetry
 * notice to stderr, and the runner reports both streams together, so the JSON
 * routinely has prose after it. `JSON.parse` rejects trailing content, which
 * would turn a perfectly good result into "could not be read".
 */
function endOfValue(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth++;
    else if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) return index + 1;
    }
  }

  return -1;
}
