import { execFile, spawn } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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

  try {
    if (process.platform === 'win32') {
      // `start` needs a title argument before the command when anything is
      // quoted, hence the empty string.
      spawn('cmd.exe', ['/c', 'start', '', 'cmd', '/k', `cd /d "${projectRoot}" && ${command}`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      }).unref();
    } else if (process.platform === 'darwin') {
      const script = `tell application "Terminal" to do script "cd '${projectRoot.replace(/'/g, "'\\''")}' && ${command}"`;
      spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn(
        'x-terminal-emulator',
        ['-e', `bash -lc 'cd "${projectRoot}" && ${command}; exec bash'`],
        {
          detached: true,
          stdio: 'ignore',
        },
      ).unref();
    }

    return {
      ok: true,
      method: 'terminal',
      message: `Opened a terminal running ${command}. The prompt is on your clipboard, ready to paste.`,
    };
  } catch (error) {
    // Implemented and attempted, so this is a runtime failure and is reported.
    return {
      ok: false,
      method: 'terminal',
      message: 'specdeck could not open a terminal.',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
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

  try {
    if (process.platform === 'win32') {
      spawn(
        'cmd.exe',
        ['/c', 'start', '', 'cmd', '/k', `cd /d "${projectRoot}" && claude --resume ${sessionId}`],
        { detached: true, stdio: 'ignore', windowsHide: false },
      ).unref();
    } else if (process.platform === 'darwin') {
      const script = `tell application "Terminal" to do script "cd '${projectRoot.replace(/'/g, "'\\''")}' && claude --resume ${sessionId}"`;
      spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn(
        'x-terminal-emulator',
        ['-e', `bash -lc 'cd "${projectRoot}" && claude --resume ${sessionId}; exec bash'`],
        { detached: true, stdio: 'ignore' },
      ).unref();
    }

    return {
      ok: true,
      method: 'attach',
      message: 'Opened that session. The prompt is on your clipboard, ready to paste.',
    };
  } catch (error) {
    return {
      ok: false,
      method: 'attach',
      message: 'specdeck could not open that session.',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
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
