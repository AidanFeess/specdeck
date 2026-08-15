import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { MemoryFileSource } from '../fs/memory-source.js';
import { NodeFileSource } from '../fs/node-source.js';
import { computeSync } from '../git/sync.js';
import { detectHarnesses } from '../openspec/harness.js';
import { listInitTools } from '../openspec/init.js';
import { readArtifact, writeArtifact } from '../write/artifact.js';
import { deriveApproval } from '../approval/derive.js';
import { indexChanges } from './index-changes.js';
import { readProject } from './project.js';

/**
 * What specdeck is allowed to write.
 *
 * This file used to assert that specdeck wrote nothing into a repository at
 * all. That promise is gone: specdeck now saves artifact edits and records
 * approvals as commits, and a principle that has quietly stopped being true is
 * worse than one that was narrowed openly.
 *
 * The narrower invariant that replaced it, and that is asserted below:
 *
 *   1. Reading a project writes nothing. Every scan, every derived answer,
 *      every git query leaves the tree byte-identical.
 *   2. specdeck writes only to paths OpenSpec owns, and never creates a file of
 *      its own anywhere inside a repository. No sidecar, no cache, no state.
 *   3. specdeck never creates a commit the user did not ask for.
 *
 * The first is what makes it safe to point at a repository you care about. The
 * second is what keeps the board honest, since a sidecar would be a second
 * source of truth. The third is the one that matters most now that approving
 * writes history.
 */

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows sometimes holds a handle briefly after a child process exits.
    }
  }
});

interface Snapshot {
  [relativePath: string]: string;
}

/**
 * Records every file's path, size, and modification time.
 *
 * `.git` is deliberately not walked. The promise being asserted is about the
 * working tree: the files a user wrote and can see. Git maintains its own index
 * and caches as a side effect of being asked read-only questions, and `git
 * status` refreshing `.git/index` is git's bookkeeping rather than specdeck
 * writing into somebody's project. Counting it made this test fail on whichever
 * runner happened to be slow enough to catch a lock file mid-write.
 */
function snapshotTree(root: string): Snapshot {
  const seen: Snapshot = {};
  (function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const stats = statSync(full);
      seen[relative(root, full).replace(/\\/g, '/')] = `${stats.size}:${stats.mtimeMs}`;
    }
  })(root);
  return seen;
}

function git(dir: string, args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
}

function buildProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'specdeck-nowrite-'));
  roots.push(dir);

  git(dir, ['init', '--quiet', '--initial-branch=main']);
  git(dir, ['config', 'user.email', 't@e.com']);
  git(dir, ['config', 'user.name', 't']);
  git(dir, ['config', 'commit.gpgsign', 'false']);

  mkdirSync(join(dir, 'openspec/changes/add-thing/specs/thing'), { recursive: true });
  mkdirSync(join(dir, 'openspec/specs/thing'), { recursive: true });
  mkdirSync(join(dir, '.claude/skills/openspec-propose'), { recursive: true });

  writeFileSync(join(dir, 'openspec/changes/add-thing/.openspec.yaml'), 'schema: spec-driven\n');
  writeFileSync(join(dir, 'openspec/changes/add-thing/proposal.md'), '## Why\nreasons\n');
  writeFileSync(join(dir, 'openspec/changes/add-thing/tasks.md'), '## 1. G\n\n- [ ] 1.1 do it\n');
  writeFileSync(
    join(dir, 'openspec/changes/add-thing/specs/thing/spec.md'),
    '## ADDED Requirements\n\n### Requirement: A\nSHALL a.\n\n#### Scenario: s\n- **WHEN** x\n',
  );
  writeFileSync(
    join(dir, 'openspec/specs/thing/spec.md'),
    '# thing Specification\n\n## Purpose\np\n\n## Requirements\n### Requirement: B\nSHALL b.\n\n#### Scenario: s\n- **WHEN** y\n',
  );
  writeFileSync(join(dir, '.claude/skills/openspec-propose/SKILL.md'), '# skill\n');

  return dir;
}

describe('reading a project writes nothing into it', () => {
  it('leaves the tree byte-identical after a full scan', async () => {
    const dir = buildProject();
    const before = snapshotTree(dir);

    // Everything the server does on a state request.
    const source = new NodeFileSource();
    await readProject(source, dir);
    await detectHarnesses(source, dir);
    await computeSync(dir);
    await listInitTools(source, dir);

    const after = snapshotTree(dir);
    expect(after).toEqual(before);
  });

  it('leaves it byte-identical after the on-demand reads too', async () => {
    const dir = buildProject();
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'init']);
    const before = snapshotTree(dir);

    // The surfaces added for reviewing: the cross-root index, approval, and
    // reading an artifact. None of them may leave a trace either.
    await indexChanges([{ path: dir }]);
    await deriveApproval(dir, 'add-thing', join(dir, 'openspec/changes/add-thing'));
    await readArtifact(join(dir, 'openspec/changes/add-thing/proposal.md'));

    expect(snapshotTree(dir)).toEqual(before);
  });

  it('reports the project correctly while doing so', async () => {
    const dir = buildProject();
    const result = await readProject(new NodeFileSource(), dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.changes).toHaveLength(1);
    expect(result.snapshot.capabilities.map((c) => c.id)).toEqual(['thing']);
  });

  it('never creates a config file inside the project', async () => {
    const dir = buildProject();
    await readProject(new NodeFileSource(), dir);
    const names = readdirSync(dir).sort();
    // Only what the fixture created.
    expect(names).toEqual(['.claude', '.git', 'openspec']);
  });
});

describe('specdeck writes only to paths OpenSpec owns', () => {
  it('writes the edited artifact and nothing else', async () => {
    const dir = buildProject();
    const file = join(dir, 'openspec/changes/add-thing/proposal.md');
    const before = snapshotTree(dir);

    const loaded = await readArtifact(file);
    if (!loaded.ok) throw new Error('fixture unreadable');
    const outcome = await writeArtifact(file, '## Why\nedited\n', loaded.artifact.hash);
    expect(outcome.ok).toBe(true);

    const after = snapshotTree(dir);

    // Exactly one path differs, and it is the artifact the user edited.
    const changed = Object.keys(after).filter((path) => after[path] !== before[path]);
    expect(changed).toEqual(['openspec/changes/add-thing/proposal.md']);

    // And nothing new appeared anywhere: no sidecar, no cache, no state file.
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
  });

  it('keeps its own configuration outside every project', async () => {
    // The registry and all preferences live in specdeck's own directory. This
    // is what stops the board from ever having a second source of truth.
    const dir = buildProject();
    await readProject(new NodeFileSource(), dir);

    const everything = Object.keys(snapshotTree(dir));
    expect(everything.some((path) => path.includes('specdeck'))).toBe(false);
    expect(everything.some((path) => path.includes('.specdeck'))).toBe(false);
  });
});

describe('specdeck never commits unless asked', () => {
  it('creates no commit while reading a project', async () => {
    const dir = buildProject();
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'init']);
    const head = git(dir, ['rev-parse', 'HEAD']);

    const source = new NodeFileSource();
    await readProject(source, dir);
    await computeSync(dir);
    await indexChanges([{ path: dir }]);
    await deriveApproval(dir, 'add-thing', join(dir, 'openspec/changes/add-thing'));

    expect(git(dir, ['rev-parse', 'HEAD'])).toBe(head);
  });

  it('creates no commit when an artifact is saved', async () => {
    const dir = buildProject();
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'init']);
    const head = git(dir, ['rev-parse', 'HEAD']);

    const file = join(dir, 'openspec/changes/add-thing/proposal.md');
    const loaded = await readArtifact(file);
    if (!loaded.ok) throw new Error('fixture unreadable');
    await writeArtifact(file, '## Why\nedited\n', loaded.artifact.hash);

    // Saving is a write, not a commit. Approving is the only thing that commits.
    expect(git(dir, ['rev-parse', 'HEAD'])).toBe(head);
    expect(git(dir, ['status', '--porcelain'])).not.toBe('');
  });

  it('does not stage anything while reading or saving', async () => {
    const dir = buildProject();
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'init']);

    const file = join(dir, 'openspec/changes/add-thing/proposal.md');
    const loaded = await readArtifact(file);
    if (!loaded.ok) throw new Error('fixture unreadable');
    await writeArtifact(file, '## Why\nedited\n', loaded.artifact.hash);
    await indexChanges([{ path: dir }]);

    // The index is the user's workspace. specdeck does not touch it.
    expect(git(dir, ['diff', '--cached', '--name-only'])).toBe('');
  });
});

describe('listInitTools', () => {
  it('lists the tools OpenSpec can configure and flags home-directory writers', async () => {
    const tools = await listInitTools(new MemoryFileSource({}), '/nowhere');
    expect(tools.length).toBeGreaterThan(20);
    expect(tools.some((t) => t.id === 'claude')).toBe(true);

    // Codex resolves its command directory from the user's home rather than the
    // project, so initializing for it reaches outside the folder being set up.
    // That has to stay disclosed.
    expect(tools.find((t) => t.id === 'codex')?.writesOutsideProject).toBe(true);
    expect(tools.find((t) => t.id === 'claude')?.writesOutsideProject).toBe(false);
  });

  it('preselects tools already present in the project', async () => {
    const dir = buildProject();
    const tools = await listInitTools(new NodeFileSource(), dir);
    expect(tools.find((t) => t.id === 'claude')?.detected).toBe(true);
    expect(tools.find((t) => t.id === 'cursor')?.detected).toBe(false);
    // Detected tools sort first so the picker opens on what matters.
    expect(tools[0]?.detected).toBe(true);
  });
});
