import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { dispatch, discoverSessions } from './handoff.js';

/**
 * The behavior worth protecting here is not that any particular method works,
 * since that depends on what is installed. It is the distinction between a
 * capability gap and a runtime failure, because collapsing the two is what would
 * let the integration break with nobody noticing.
 */

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can hold a handle briefly.
    }
  }
});

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'specdeck-handoff-'));
  roots.push(dir);
  return dir;
}

describe('dispatch', () => {
  it('always resolves to clipboard when that is the ceiling', async () => {
    const result = await dispatch({
      projectRoot: sandbox(),
      harnessId: 'claude',
      preferred: 'clipboard',
    });
    expect(result.ok).toBe(true);
    expect(result.method).toBe('clipboard');
  });

  it('falls through to clipboard for a harness with no terminal command', async () => {
    // A capability gap, so it degrades silently rather than reporting an error.
    const result = await dispatch({
      projectRoot: sandbox(),
      harnessId: 'some-editor-nobody-has',
      preferred: 'terminal',
    });
    expect(result.ok).toBe(true);
    expect(result.method).toBe('clipboard');
  });

  it('does not attempt attach when no session was supplied', async () => {
    const result = await dispatch({
      projectRoot: sandbox(),
      harnessId: 'some-editor-nobody-has',
      preferred: 'auto',
    });
    // Attach is skipped, terminal is a gap for this harness, so clipboard wins.
    expect(result.method).toBe('clipboard');
    expect(result.ok).toBe(true);
  });

  it('never attempts a method above the user ceiling', async () => {
    // With clipboard selected, nothing may spawn a terminal or a session, even
    // if both are available on this machine.
    const result = await dispatch({
      projectRoot: sandbox(),
      harnessId: 'claude',
      preferred: 'clipboard',
      sessionId: 'would-be-used-if-the-ceiling-were-ignored',
    });
    expect(result.method).toBe('clipboard');
  });
});

describe('terminal launch', () => {
  it('reports a failure when the project directory is gone', async () => {
    // Previously the window opened, cmd failed on its own with "The filename,
    // directory name, or volume label syntax is incorrect", and specdeck still
    // reported the handoff as succeeded because the spawn itself worked.
    const result = await dispatch({
      projectRoot: join(sandbox(), 'deleted-since'),
      harnessId: 'claude',
      preferred: 'terminal',
    });
    expect(result.ok).toBe(false);
    expect(result.capabilityGap).toBeUndefined();
    expect(result.message).toContain('no longer exists');
  });

  it('never puts the project path inside the command string', () => {
    // The original bug: a path embedded in a cmd /k argument has to be quoted
    // again as one argv element, and the nested quotes collide. The path now
    // travels as the spawn's working directory instead, so this asserts the
    // source contains no such construction.
    const source = readFileSync(
      new URL('./handoff.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
      'utf8',
    );
    expect(source).not.toContain('cd /d');
  });
});

describe('discoverSessions', () => {
  it('returns nothing rather than throwing when the harness stores nothing', () => {
    // Undocumented internal storage. A reshaped or absent directory has to read
    // as "no sessions", so the option hides instead of erroring.
    const sessions = discoverSessions(sandbox());
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions).toEqual([]);
  });

  it('never returns a session belonging to another project', () => {
    // Sessions are matched by working directory, so a machine with real sessions
    // still yields none for a directory that has never been opened.
    const sessions = discoverSessions(join(sandbox(), 'never-opened'));
    expect(sessions).toEqual([]);
  });
});
