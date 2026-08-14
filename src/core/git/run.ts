import { execFile } from 'node:child_process';

/**
 * Running git as a subprocess.
 *
 * Always with an argument array, never a shell string. Project paths contain
 * spaces, quotes, and on Windows backslashes, and a shell string would make
 * those a quoting problem at best and an injection at worst.
 */

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

export interface GitOptions {
  cwd: string;
  /** Longer for network operations such as fetch. */
  timeoutMs?: number;
  /** Extra environment, merged over the safe defaults. */
  env?: Record<string, string>;
}

/**
 * Environment applied to every git call.
 *
 * `GIT_TERMINAL_PROMPT=0` is the important one. Without it, a fetch against an
 * HTTPS remote with no cached credential blocks forever waiting for input that
 * can never arrive, and a hung background fetch inside a local web app is
 * invisible and unkillable from the interface. With it, the fetch fails fast and
 * the board can say the remote could not be reached.
 */
function baseEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    // Keep output stable regardless of the user's locale and config.
    LC_ALL: 'C',
    GIT_OPTIONAL_LOCKS: '0',
    ...extra,
  };
}

export function git(args: string[], options: GitOptions): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd: options.cwd,
        env: baseEnv(options.env),
        timeout: options.timeoutMs ?? 10_000,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const code =
          error && typeof (error as { code?: unknown }).code === 'number'
            ? (error as { code: number }).code
            : error
              ? 1
              : 0;
        resolve({ ok: !error, stdout, stderr, code });
      },
    );
  });
}

/** Splits NUL-separated output, dropping the trailing empty field. */
export function splitNul(output: string): string[] {
  return output.split('\0').filter((part) => part !== '');
}
