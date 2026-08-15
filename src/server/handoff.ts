import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Delivering a handoff payload to an agent.
 *
 * Three methods, tried in order of how integrated they are. The important part
 * is not the ladder itself but how it fails:
 *
 *   a capability gap  the method is not implemented for this harness, so the
 *                     next one is used silently. Expected, not an error.
 *
 *   a runtime failure the method exists, was attempted, and broke. That is
 *                     reported with the real reason and the lower method is
 *                     offered as a choice rather than taken automatically.
 *
 * Silently degrading on a runtime failure is what would let the whole
 * integration break with nobody ever filing a bug, because nothing would look
 * wrong.
 */

export type HandoffMethod = 'attach' | 'terminal' | 'clipboard';

export interface HandoffAttempt {
  ok: boolean;
  method: HandoffMethod;
  /** Written for a user reading it in the interface. */
  message: string;
  /** True when this method simply is not available here. */
  capabilityGap?: boolean;
  /** The real error, when an implemented method failed. */
  detail?: string;
}

// ---------------------------------------------------------------------------
// Session discovery
// ---------------------------------------------------------------------------

export interface AgentSession {
  id: string;
  /** Human readable name, when the harness records one. */
  name?: string;
  /** Working directory the session was started in. */
  cwd: string;
  kind?: string;
}

/**
 * Finds running Claude Code sessions for a project.
 *
 * This reads undocumented internal storage under the user's home directory, so
 * every step is guarded and any failure simply means no sessions were found. The
 * caller hides the option entirely in that case rather than showing something
 * that cannot work.
 */
export function discoverSessions(projectRoot: string): AgentSession[] {
  const dir = join(homedir(), '.claude', 'sessions');

  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }

  const wanted = projectRoot.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
  const sessions: AgentSession[] = [];

  for (const name of names) {
    try {
      const file = join(dir, name);
      if (!statSync(file).isFile()) continue;
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null) continue;

      const record = parsed as Record<string, unknown>;
      const cwd = typeof record.cwd === 'string' ? record.cwd : undefined;
      const id = typeof record.sessionId === 'string' ? record.sessionId : undefined;
      if (cwd === undefined || id === undefined) continue;

      if (cwd.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '') !== wanted) continue;

      const session: AgentSession = { id, cwd };
      if (typeof record.name === 'string' && record.name !== '') session.name = record.name;
      if (typeof record.kind === 'string') session.kind = record.kind;
      sessions.push(session);
    } catch {
      // One unreadable or reshaped file must not hide the others.
    }
  }

  return sessions;
}

// ---------------------------------------------------------------------------
// Terminal
// ---------------------------------------------------------------------------

/** Harnesses with a command that makes sense to open a terminal on. */
const TERMINAL_COMMANDS: Record<string, string> = {
  claude: 'claude',
  opencode: 'opencode',
  gemini: 'gemini',
  codex: 'codex',
  cursor: 'cursor-agent',
};

function commandExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    execFile(probe, [command], { windowsHide: true }, (error) => resolve(!error));
  });
}

/**
 * Opens a terminal in the project directory, with the payload on the clipboard.
 *
 * The payload is deliberately not typed into the terminal. Injecting keystrokes
 * into a shell the user did not start is both fragile and alarming, and pasting
 * is one keypress.
 */
async function openTerminal(projectRoot: string, harnessId: string): Promise<HandoffAttempt> {
  const command = TERMINAL_COMMANDS[harnessId];
  if (command === undefined) {
    return {
      ok: false,
      method: 'terminal',
      capabilityGap: true,
      message: `specdeck does not know how to start ${harnessId} in a terminal.`,
    };
  }

  if (!(await commandExists(command))) {
    return {
      ok: false,
      method: 'terminal',
      capabilityGap: true,
      message: `${command} is not on your PATH, so specdeck cannot open a terminal for it.`,
    };
  }

  return openTerminalAt(
    projectRoot,
    [command],
    'terminal',
    `Opened a terminal running ${command}.`,
  );
}

/**
 * Opens a terminal in a directory and runs a command there.
 *
 * The directory is never written into the command string. On Windows, a command
 * containing a quoted path has to be quoted again as a single argv element,
 * and the nested quotes collide: cmd receives a malformed path and answers with
 * "The filename, directory name, or volume label syntax is incorrect". Setting
 * the working directory on the spawn instead removes the problem entirely,
 * rather than trying to escape around it.
 *
 * It also makes a bad path a real spawn error, because the runtime rejects a
 * cwd that does not exist. Previously the window opened and failed on its own,
 * where nothing could observe it.
 */
async function openTerminalAt(
  projectRoot: string,
  argv: string[],
  method: HandoffMethod,
  successMessage: string,
): Promise<HandoffAttempt> {
  if (!existsSync(projectRoot)) {
    return {
      ok: false,
      method,
      message: `${projectRoot} no longer exists, so specdeck could not open a terminal there.`,
    };
  }

  try {
    if (process.platform === 'win32') {
      // `start` takes a window title first, hence the empty string. Everything
      // after `/k` is joined into the command, so each part stays its own argv
      // element and nothing needs quoting.
      await spawnDetached('cmd.exe', ['/c', 'start', '', 'cmd', '/k', ...argv], projectRoot);
    } else if (process.platform === 'darwin') {
      // Terminal.app always opens a new shell in the home directory, so this is
      // the one platform that genuinely needs a cd. Single quotes are escaped
      // the POSIX way.
      const quoted = projectRoot.replace(/'/g, `'\\''`);
      const script = `tell application "Terminal" to do script "cd '${quoted}' && ${argv.join(' ')}"`;
      await spawnDetached('osascript', ['-e', script], projectRoot);
    } else {
      await spawnDetached(
        'x-terminal-emulator',
        ['-e', 'bash', '-lc', `${argv.join(' ')}; exec bash`],
        projectRoot,
      );
    }

    return {
      ok: true,
      method,
      message: `${successMessage} The prompt is on your clipboard, ready to paste.`,
    };
  } catch (error) {
    // Implemented and attempted, so this is a runtime failure and is reported.
    return {
      ok: false,
      method,
      message: 'specdeck could not open a terminal.',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Spawns a detached process, surfacing a launch failure instead of losing it.
 *
 * A detached spawn reports failure asynchronously through an error event, so
 * returning immediately would report success for a process that never started.
 * This waits briefly for that event before treating the launch as good.
 */
function spawnDetached(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });

    setTimeout(() => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    }, 300);
  });
}

// ---------------------------------------------------------------------------
// Attach
// ---------------------------------------------------------------------------

/**
 * Opens an existing agent session.
 *
 * There is no verified way to push a message into a running conversation, so
 * this opens the session and leaves the payload on the clipboard. The interface
 * says exactly that rather than implying the message was delivered.
 */
async function attachSession(projectRoot: string, sessionId: string): Promise<HandoffAttempt> {
  if (!(await commandExists('claude'))) {
    return {
      ok: false,
      method: 'attach',
      capabilityGap: true,
      message: 'The claude command is not on your PATH.',
    };
  }

  // Resuming is cwd-scoped: the session only resolves from the directory it was
  // started in, which the spawn's working directory now guarantees.
  return openTerminalAt(
    projectRoot,
    ['claude', '--resume', sessionId],
    'attach',
    'Opened that session.',
  );
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface DispatchRequest {
  projectRoot: string;
  harnessId: string;
  /** The user's ceiling. `auto` means use the most integrated method available. */
  preferred: 'auto' | HandoffMethod;
  /** Required for the attach method. */
  sessionId?: string;
}

/**
 * Resolves and performs a handoff.
 *
 * Methods above the user's preference are never attempted. Below it, a
 * capability gap falls through silently, while a runtime failure stops and
 * reports rather than quietly using something weaker.
 */
export async function dispatch(request: DispatchRequest): Promise<HandoffAttempt> {
  const ladder: HandoffMethod[] = ['attach', 'terminal', 'clipboard'];
  const ceiling = request.preferred === 'auto' ? 'attach' : request.preferred;
  const start = ladder.indexOf(ceiling);

  for (const method of ladder.slice(start === -1 ? 0 : start)) {
    if (method === 'clipboard') {
      // The floor. Always available, because the browser does the copying.
      return {
        ok: true,
        method: 'clipboard',
        message: 'Copy the prompt and paste it into your agent.',
      };
    }

    if (method === 'attach') {
      if (request.sessionId === undefined) {
        // No running session is a capability gap, not a failure.
        continue;
      }
      const attempt = await attachSession(request.projectRoot, request.sessionId);
      if (attempt.ok || attempt.capabilityGap !== true) return attempt;
      continue;
    }

    const attempt = await openTerminal(request.projectRoot, request.harnessId);
    if (attempt.ok || attempt.capabilityGap !== true) return attempt;
  }

  return {
    ok: true,
    method: 'clipboard',
    message: 'Copy the prompt and paste it into your agent.',
  };
}
