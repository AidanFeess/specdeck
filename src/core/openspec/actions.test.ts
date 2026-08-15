import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { createChange, isSafeName, linkInitiative } from './actions.js';

/**
 * The actions run real OpenSpec commands against real directories, because the
 * behaviour worth protecting is what the CLI actually does with the arguments
 * it is handed.
 */

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can briefly hold a handle after a child process exits.
    }
  }
});

function buildProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'specdeck-actions-'));
  roots.push(dir);
  mkdirSync(join(dir, 'openspec/changes'), { recursive: true });
  mkdirSync(join(dir, 'openspec/specs'), { recursive: true });
  writeFileSync(join(dir, 'openspec/project.md'), '# Project\n', 'utf8');
  return dir;
}

describe('creating a change', () => {
  it('creates it with OpenSpec’s own command', async () => {
    const dir = buildProject();
    const outcome = await createChange(dir, 'add-widget');

    expect(outcome.ok).toBe(true);
    expect(outcome.command).toBe('openspec new change add-widget');
    expect(readdirSync(join(dir, 'openspec/changes'))).toContain('add-widget');
  });

  it('refuses a name that could escape the changes directory, spawning nothing', async () => {
    const dir = buildProject();
    const outcome = await createChange(dir, '../../etc/passwd');

    expect(outcome.ok).toBe(false);
    // Nothing ran, so there is no output to show: the refusal happened first.
    expect(outcome.output).toBe('');
    expect(outcome.message).toMatch(/letters, numbers/i);
    expect(readdirSync(join(dir, 'openspec/changes'))).toEqual([]);
  });

  it('reports the command, status, and real output when the command fails', async () => {
    const dir = buildProject();
    await createChange(dir, 'add-widget');

    // The same name twice: OpenSpec refuses, and that refusal is what we show.
    const outcome = await createChange(dir, 'add-widget');

    expect(outcome.ok).toBe(false);
    expect(outcome.command).toBe('openspec new change add-widget');
    expect(outcome.exitCode).toBeGreaterThan(0);
    expect(outcome.output).not.toBe('');
  });
});

describe('linking an initiative', () => {
  it('refuses an unsafe initiative id without spawning anything', async () => {
    const dir = buildProject();
    const outcome = await linkInitiative(dir, 'add-widget', '../escape');

    expect(outcome.ok).toBe(false);
    expect(outcome.output).toBe('');
  });

  it('reports the command and output when OpenSpec rejects the link', async () => {
    const dir = buildProject();
    await createChange(dir, 'add-widget');

    // No context store is registered, so this cannot succeed. What matters is
    // that the failure is legible rather than swallowed.
    const outcome = await linkInitiative(dir, 'add-widget', 'no-such-initiative');

    expect(outcome.ok).toBe(false);
    expect(outcome.command).toContain('openspec set change add-widget --initiative');
    expect(outcome.output).not.toBe('');
  });
});

describe('isSafeName', () => {
  it('accepts the kebab-case names OpenSpec changes actually use', () => {
    expect(isSafeName('add-widget')).toBe(true);
    expect(isSafeName('add-review-and-openspec-integration')).toBe(true);
    expect(isSafeName('v2.1_thing')).toBe(true);
  });

  it('rejects anything that could traverse or inject', () => {
    expect(isSafeName('../escape')).toBe(false);
    expect(isSafeName('a/b')).toBe(false);
    expect(isSafeName('a b')).toBe(false);
    expect(isSafeName('-leading-dash')).toBe(false);
    expect(isSafeName('')).toBe(false);
    expect(isSafeName('a..b')).toBe(false);
  });
});
