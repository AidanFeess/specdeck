import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { hashContent, readArtifact, writeArtifact } from './artifact.js';

/**
 * The write guard exists for one situation: an agent rewrites an artifact while
 * a user is editing it in the browser. Every test here is a version of that.
 */

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can briefly hold a handle open.
    }
  }
});

function buildProject(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'specdeck-artifact-'));
  roots.push(dir);
  mkdirSync(join(dir, 'openspec/changes/add-thing'), { recursive: true });
  const file = join(dir, 'openspec/changes/add-thing/proposal.md');
  writeFileSync(file, '## Why\noriginal\n', 'utf8');
  return { dir, file };
}

describe('reading an artifact', () => {
  it('returns the exact bytes and a hash of them', async () => {
    const { file } = buildProject();
    const outcome = await readArtifact(file);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.artifact.text).toBe('## Why\noriginal\n');
    expect(outcome.artifact.hash).toBe(hashContent('## Why\noriginal\n'));
  });

  it('reports a missing file rather than throwing', async () => {
    const { dir } = buildProject();
    const outcome = await readArtifact(join(dir, 'nope.md'));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe('missing');
  });
});

describe('writing an artifact', () => {
  it('writes when the file has not changed underneath', async () => {
    const { file } = buildProject();
    const before = await readArtifact(file);
    if (!before.ok) throw new Error('fixture unreadable');

    const outcome = await writeArtifact(file, '## Why\nedited\n', before.artifact.hash);

    expect(outcome.ok).toBe(true);
    expect(await readFile(file, 'utf8')).toBe('## Why\nedited\n');
  });

  it('refuses when an agent rewrote the file mid-edit, and says what is there now', async () => {
    const { file } = buildProject();
    const before = await readArtifact(file);
    if (!before.ok) throw new Error('fixture unreadable');

    // The agent's write lands between the read and the save.
    writeFileSync(file, '## Why\nagent wrote this\n', 'utf8');

    const outcome = await writeArtifact(file, '## Why\nmy edit\n', before.artifact.hash);

    expect(outcome.ok).toBe(false);
    if (outcome.ok || outcome.reason !== 'conflict') throw new Error('expected a conflict');

    // Nothing merged, nothing clobbered: the agent's work is intact...
    expect(await readFile(file, 'utf8')).toBe('## Why\nagent wrote this\n');
    // ...and the caller is handed what is actually on disk, so it can show it.
    expect(outcome.current.text).toBe('## Why\nagent wrote this\n');
  });

  it('refuses a second save that reuses a stale hash', async () => {
    const { file } = buildProject();
    const first = await readArtifact(file);
    if (!first.ok) throw new Error('fixture unreadable');

    const saved = await writeArtifact(file, '## Why\nfirst\n', first.artifact.hash);
    expect(saved.ok).toBe(true);

    // Saving again with the original hash must fail: the file has moved on.
    const again = await writeArtifact(file, '## Why\nsecond\n', first.artifact.hash);
    expect(again.ok).toBe(false);
    expect(await readFile(file, 'utf8')).toBe('## Why\nfirst\n');
  });

  it('accepts the hash returned by the previous successful save', async () => {
    const { file } = buildProject();
    const first = await readArtifact(file);
    if (!first.ok) throw new Error('fixture unreadable');

    const saved = await writeArtifact(file, '## Why\nfirst\n', first.artifact.hash);
    if (!saved.ok) throw new Error('expected the first save to succeed');

    const again = await writeArtifact(file, '## Why\nsecond\n', saved.hash);
    expect(again.ok).toBe(true);
    expect(await readFile(file, 'utf8')).toBe('## Why\nsecond\n');
  });

  it('creates no sidecar files anywhere in the project', async () => {
    const { dir, file } = buildProject();
    const before = await readArtifact(file);
    if (!before.ok) throw new Error('fixture unreadable');

    await writeArtifact(file, '## Why\nedited\n', before.artifact.hash);

    const names = readdirSync(dir).sort();
    expect(names).toEqual(['openspec']);
    expect(readdirSync(join(dir, 'openspec/changes/add-thing')).sort()).toEqual(['proposal.md']);
  });
});

describe('hashContent', () => {
  it('differs for content that differs, including in whitespace', () => {
    expect(hashContent('a')).not.toBe(hashContent('b'));
    expect(hashContent('a\n')).not.toBe(hashContent('a'));
    expect(hashContent('a')).toBe(hashContent('a'));
  });

  it('is short enough to travel in a request without being unwieldy', () => {
    expect(hashContent('anything').length).toBe(22);
    expect(hashContent('anything')).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
