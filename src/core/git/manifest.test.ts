import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { diffManifests, readManifest } from './manifest.js';

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can hold a handle briefly after a git child exits.
    }
  }
});

function run(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

function write(dir: string, relative: string, content: string): void {
  const path = join(dir, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

describe('manifest', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'specdeck-manifest-'));
    roots.push(dir);
    run(dir, 'init', '--quiet', '--initial-branch=main');
    run(dir, 'config', 'user.email', 't@e.com');
    run(dir, 'config', 'user.name', 't');
    run(dir, 'config', 'commit.gpgsign', 'false');

    write(dir, 'openspec/specs/user-auth/spec.md', '# user-auth\n');
    write(dir, 'openspec/changes/add-thing/proposal.md', '## Why\nreasons\n');
    write(dir, 'openspec/changes/add-thing/tasks.md', '- [ ] 1.1 a\n');
    write(dir, 'src/index.ts', 'export {};\n');
    run(dir, 'add', '-A');
    run(dir, 'commit', '--quiet', '-m', 'seed');
  });

  it('lists blobs with their hashes', async () => {
    const manifest = await readManifest(dir, 'HEAD');
    expect(manifest.ok).toBe(true);
    expect([...manifest.entries.keys()].sort()).toEqual([
      'openspec/changes/add-thing/proposal.md',
      'openspec/changes/add-thing/tasks.md',
      'openspec/specs/user-auth/spec.md',
    ]);
    for (const hash of manifest.entries.values()) {
      expect(hash).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it('scopes to the OpenSpec tree rather than the whole repository', async () => {
    const manifest = await readManifest(dir, 'HEAD');
    expect([...manifest.entries.keys()].some((p) => p.startsWith('src/'))).toBe(false);
  });

  it('gives identical content identical hashes', async () => {
    // This is the property that makes a future remote source cheap: comparison
    // is hash equality, with no file reads at all.
    const a = await readManifest(dir, 'HEAD');
    const b = await readManifest(dir, 'HEAD');
    expect(diffManifests(a, b).differing).toEqual([]);
    expect(diffManifests(a, b).identical.length).toBe(a.entries.size);
  });

  it('reports a bad reference rather than returning an empty manifest', async () => {
    // An empty manifest is indistinguishable from a tree with no files, which is
    // exactly the confusion that makes sync state lie.
    const manifest = await readManifest(dir, 'no-such-ref');
    expect(manifest.ok).toBe(false);
    expect(manifest.reason).toBeDefined();
    expect(manifest.entries.size).toBe(0);
  });

  it('diffs two references by hash', async () => {
    run(dir, 'checkout', '--quiet', '-b', 'feature');
    write(dir, 'openspec/changes/add-thing/design.md', '## Context\nnew\n');
    write(dir, 'openspec/changes/add-thing/tasks.md', '- [x] 1.1 a\n');
    run(dir, 'add', '-A');
    run(dir, 'commit', '--quiet', '-m', 'feature work');

    const main = await readManifest(dir, 'main');
    const feature = await readManifest(dir, 'feature');
    const diff = diffManifests(feature, main);

    expect(diff.onlyLeft).toEqual(['openspec/changes/add-thing/design.md']);
    expect(diff.onlyRight).toEqual([]);
    expect(diff.differing).toEqual(['openspec/changes/add-thing/tasks.md']);
    expect(diff.identical).toContain('openspec/specs/user-auth/spec.md');
  });

  it('excludes submodule gitlinks, which are commits rather than blobs', async () => {
    const outer = mkdtempSync(join(tmpdir(), 'specdeck-outer-'));
    roots.push(outer);
    run(outer, 'init', '--quiet', '--initial-branch=main');
    run(outer, 'config', 'user.email', 't@e.com');
    run(outer, 'config', 'user.name', 't');
    run(outer, 'config', 'commit.gpgsign', 'false');
    write(outer, 'openspec/specs/outer/spec.md', '# outer\n');
    run(outer, 'add', '-A');
    run(outer, 'commit', '--quiet', '-m', 'outer');

    // The gitlink is written into the index directly rather than by adding a
    // real submodule. Modern git refuses file:// submodule transport, and the
    // thing under test is only how a mode 160000 tree entry is handled, so
    // fabricating the entry tests exactly that with no clone and no transport
    // policy involved.
    const commitSha = run(outer, 'rev-parse', 'HEAD').trim();
    run(outer, 'update-index', '--add', '--cacheinfo', `160000,${commitSha},openspec/vendored`);
    run(outer, 'commit', '--quiet', '-m', 'add gitlink');

    // Confirm the fixture really is a gitlink, so a passing test cannot be
    // vacuous.
    const raw = run(outer, 'ls-tree', '-r', 'HEAD', '--', 'openspec');
    expect(raw).toContain('160000 commit');

    const manifest = await readManifest(outer, 'HEAD');
    expect(manifest.ok).toBe(true);
    expect([...manifest.entries.keys()]).not.toContain('openspec/vendored');
    expect(manifest.skipped).toContain('openspec/vendored');
    // The parent's own specs are still listed.
    expect([...manifest.entries.keys()]).toContain('openspec/specs/outer/spec.md');
  });
});
