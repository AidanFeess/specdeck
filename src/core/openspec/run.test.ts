import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

import { openspecCommand, parseJsonOutput, runOpenspec } from './run.js';

/**
 * The runner is the only thing in specdeck allowed to spawn OpenSpec, and the
 * value of that rule is entirely in it being enforced rather than remembered.
 * The scan below is the enforcement.
 */

const bundleMissing = vi.hoisted(() => ({ value: false }));

vi.mock('./installed.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./installed.js')>();
  return {
    ...actual,
    findBundledOpenSpecRoot: (): string | undefined =>
      bundleMissing.value ? undefined : actual.findBundledOpenSpecRoot(),
  };
});

const SRC_DIR = fileURLToPath(new URL('../..', import.meta.url));
const RUNNER = join(SRC_DIR, 'core', 'openspec', 'run.ts');

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
      continue;
    }
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

describe('only the runner spawns OpenSpec', () => {
  it('has no other module referencing the OpenSpec binary', () => {
    const offenders = sourceFiles(SRC_DIR)
      .filter((file) => file !== RUNNER)
      .filter((file) => /openspec\.js/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC_DIR, file).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });

  it('leaves git as the only other subprocess wrapper', () => {
    // `execFile` itself is legitimate elsewhere: git has its own runner, and the
    // editor and terminal handoff both launch programs. What must not reappear
    // is a second path to the OpenSpec CLI, which the assertion above covers.
    const spawners = sourceFiles(SRC_DIR)
      .filter((file) => /from 'node:child_process'/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC_DIR, file).replace(/\\/g, '/'))
      .sort();

    expect(spawners).toEqual([
      'core/git/run.ts',
      'core/openspec/run.ts',
      'server/browse.ts',
      'server/editor.ts',
      'server/editors.ts',
      'server/handoff.ts',
    ]);
  });
});

describe('runOpenspec', () => {
  it('runs a command and reports success', async () => {
    const result = await runOpenspec(process.cwd(), ['--version']);

    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
    expect(result.failure).toBeUndefined();
    expect(result.output).toMatch(/\d+\.\d+\.\d+/);
  });

  it('reports the copy-pasteable command, not the invocation that ran', async () => {
    const result = await runOpenspec(process.cwd(), ['validate', 'a-change', '--json']);

    expect(result.command).toBe('openspec validate a-change --json');
    expect(result.command).not.toMatch(/openspec\.js/);
    expect(result.command).not.toMatch(/node/i);
  });

  it('preserves the command output when the command exits non-zero', async () => {
    const result = await runOpenspec(process.cwd(), ['definitely-not-a-command']);

    expect(result.ok).toBe(false);
    expect(result.failure).toBe('exit');
    expect(result.code).toBeGreaterThan(0);
    expect(result.output).not.toBe('');
    expect(result.message).toContain(String(result.code));
  });

  it('reports a timeout as a timeout rather than a generic failure', async () => {
    const result = await runOpenspec(process.cwd(), ['--version'], { timeoutMs: 1 });

    expect(result.ok).toBe(false);
    expect(result.failure).toBe('timeout');
    expect(result.message).toMatch(/did not finish/i);
  });

  it('reports a missing bundle without spawning anything', async () => {
    bundleMissing.value = true;
    try {
      const result = await runOpenspec(process.cwd(), ['archive', 'a-change', '-y']);

      expect(result.ok).toBe(false);
      expect(result.failure).toBe('missing-openspec');
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      // The whole point of this path: the user is handed something to run.
      expect(result.command).toBe('openspec archive a-change -y');
      expect(result.message).toMatch(/run the command yourself/i);
    } finally {
      bundleMissing.value = false;
    }
  });
});

describe('openspecCommand', () => {
  it('quotes arguments that would not survive a copy and paste', () => {
    expect(openspecCommand(['new', 'change', 'add thing'])).toBe(
      'openspec new change "add thing"',
    );
    expect(openspecCommand(['archive', 'plain', '-y'])).toBe('openspec archive plain -y');
  });
});

describe('parseJsonOutput', () => {
  it('finds JSON that follows progress output', () => {
    const parsed = parseJsonOutput<{ items: number[] }>('- Loading...\n{"items":[1,2]}');
    expect(parsed?.items).toEqual([1, 2]);
  });

  it('finds a top-level array', () => {
    expect(parseJsonOutput<number[]>('noise\n[1,2]')).toEqual([1, 2]);
  });

  it('ignores prose that follows the JSON', () => {
    // OpenSpec writes a telemetry notice to stderr, and the runner reports both
    // streams together, so trailing prose is the normal case rather than a
    // corner one. `JSON.parse` rejects it outright.
    const parsed = parseJsonOutput<{ items: number[] }>(
      '{"items":[1,2]}\nNote: OpenSpec collects anonymous usage stats. Opt out: OPENSPEC_TELEMETRY=0\n',
    );
    expect(parsed?.items).toEqual([1, 2]);
  });

  it('is not confused by braces inside strings', () => {
    const parsed = parseJsonOutput<{ message: string }>('{"message":"a } and a \\" quote"}trailing');
    expect(parsed?.message).toBe('a } and a " quote');
  });

  it('returns undefined rather than throwing on unparseable output', () => {
    expect(parseJsonOutput('not json at all')).toBeUndefined();
    expect(parseJsonOutput('{ broken')).toBeUndefined();
  });
});
