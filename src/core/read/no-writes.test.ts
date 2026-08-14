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
import { readProject } from './project.js';

/**
 * specdeck reads other people's repositories. The promise that it writes nothing
 * into them is the reason it is safe to point at a project you care about, and a
 * promise like that is worth an assertion rather than a paragraph in a README.
 *
 * The scan path also must never invoke an OpenSpec command that rewrites the
 * user's global configuration, which `openspec update` does as a side effect of
 * inferring settings from the project it is pointed at.
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

/** Records every file's path, size, and modification time. */
function snapshotTree(root: string): Snapshot {
  const seen: Snapshot = {};
  (function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
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

function buildProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'specdeck-nowrite-'));
  roots.push(dir);

  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });

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
