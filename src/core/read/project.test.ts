import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MemoryFileSource } from '../fs/memory-source.js';
import { NodeFileSource } from '../fs/node-source.js';
import { matchesGlob } from '../model/derive.js';
import { parseCapability } from '../parse/capability.js';
import { parseDeltaSpec } from '../parse/delta.js';
import { parseTasks, toggleTaskLine } from '../parse/tasks.js';
import { readProject } from './project.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('matchesGlob', () => {
  it('matches the patterns OpenSpec schemas use', () => {
    expect(matchesGlob('proposal.md', 'proposal.md')).toBe(true);
    expect(matchesGlob('proposal.md', 'specs/a/proposal.md')).toBe(false);
    expect(matchesGlob('specs/**/*.md', 'specs/user-auth/spec.md')).toBe(true);
    expect(matchesGlob('specs/**/*.md', 'specs/a/b/spec.md')).toBe(true);
    // `**/` may match nothing, so a file directly under specs/ still counts.
    expect(matchesGlob('specs/**/*.md', 'specs/spec.md')).toBe(true);
    expect(matchesGlob('specs/**/*.md', 'design.md')).toBe(false);
  });
});

describe('parseTasks', () => {
  it('counts checkboxes and records their lines', () => {
    const list = parseTasks(
      [
        '## 1. Setup',
        '',
        '- [x] 1.1 first',
        '- [ ] 1.2 second',
        '',
        '## 2. Build',
        '',
        '- [ ] 2.1 third',
      ].join('\n'),
      '/t/tasks.md',
    );
    expect(list.total).toBe(3);
    expect(list.completed).toBe(1);
    expect(list.groups.map((g) => g.number)).toEqual(['1', '2']);
    expect(list.groups[0]?.tasks[0]).toMatchObject({
      id: '1.1',
      text: 'first',
      completed: true,
      line: 3,
    });
  });

  it('flags a tasks file that uses plain bullets instead of checkboxes', () => {
    // OpenSpec tracks nothing here, so the change would sit at 0 percent forever.
    const list = parseTasks('## 1. Setup\n\n- do a thing\n- do another\n', '/t/tasks.md');
    expect(list.total).toBe(0);
    expect(list.issues[0]?.severity).toBe('error');
  });

  it('ignores checkboxes inside fenced code blocks', () => {
    const list = parseTasks(
      '## 1. G\n\n```\n- [ ] 1.1 example from docs\n```\n\n- [ ] 1.1 real\n',
      '/t/tasks.md',
    );
    expect(list.total).toBe(1);
  });
});

describe('toggleTaskLine', () => {
  const content = '## 1. Setup\n\n- [ ] 1.1 first\n- [x] 1.2 second\n';

  it('ticks a box', () => {
    expect(toggleTaskLine(content, 3, 'first', true)).toContain('- [x] 1.1 first');
  });

  it('unticks a box', () => {
    expect(toggleTaskLine(content, 4, 'second', false)).toContain('- [ ] 1.2 second');
  });

  it('refuses when the line no longer holds the expected task', () => {
    // This is the guard against clobbering an agent that rewrote the file
    // between the read and the click.
    expect(toggleTaskLine(content, 3, 'something else', true)).toBeUndefined();
  });

  it('refuses when the line is not a checkbox', () => {
    expect(toggleTaskLine(content, 1, 'Setup', true)).toBeUndefined();
  });
});

describe('parseCapability', () => {
  it('reads requirements and scenarios', () => {
    const cap = parseCapability(
      'user-auth',
      '/s/spec.md',
      [
        '# user-auth Specification',
        '',
        '## Purpose',
        'Handles login.',
        '',
        '## Requirements',
        '### Requirement: User can log in',
        'The system SHALL authenticate users.',
        '',
        '#### Scenario: Valid credentials',
        '- **WHEN** valid',
        '- **THEN** token',
      ].join('\n'),
    );
    expect(cap.title).toBe('user-auth');
    expect(cap.purpose).toBe('Handles login.');
    expect(cap.requirements).toHaveLength(1);
    expect(cap.requirements[0]?.scenarios[0]?.name).toBe('Valid credentials');
    expect(cap.requirements[0]?.text).toContain('SHALL authenticate');
  });

  it('detects the three-hash scenario mistake', () => {
    const cap = parseCapability(
      'x',
      '/s/spec.md',
      [
        '## Requirements',
        '### Requirement: A',
        'text',
        '### Scenario: wrong depth',
        '- **WHEN** a',
      ].join('\n'),
    );
    expect(cap.issues.some((i) => i.severity === 'error' && i.message.includes('four'))).toBe(true);
  });
});

describe('parseDeltaSpec', () => {
  it('attributes requirements to their delta operation', () => {
    const delta = parseDeltaSpec(
      'user-auth',
      '/d/spec.md',
      [
        '## ADDED Requirements',
        '### Requirement: New thing',
        'SHALL do it.',
        '#### Scenario: ok',
        '- **WHEN** a',
        '',
        '## REMOVED Requirements',
        '### Requirement: Old thing',
        '**Reason**: replaced',
        '**Migration**: use the new endpoint',
        '#### Scenario: n/a',
        '- **WHEN** b',
      ].join('\n'),
    );
    expect(delta.requirements.map((r) => r.operation)).toEqual(['added', 'removed']);
    expect(delta.requirements[1]?.reason).toBe('replaced');
    expect(delta.requirements[1]?.migration).toBe('use the new endpoint');
  });

  it('warns when a removed requirement omits its migration', () => {
    const delta = parseDeltaSpec(
      'x',
      '/d/spec.md',
      [
        '## REMOVED Requirements',
        '### Requirement: Gone',
        '**Reason**: obsolete',
        '#### Scenario: n/a',
        '- **WHEN** a',
      ].join('\n'),
    );
    expect(delta.issues.some((i) => i.message.includes('Migration'))).toBe(true);
  });

  it('errors when no operation section is declared', () => {
    const delta = parseDeltaSpec('x', '/d/spec.md', '### Requirement: Loose\ntext\n');
    expect(delta.issues.some((i) => i.severity === 'error')).toBe(true);
  });
});

describe('readProject on a synthetic project', () => {
  const files: Record<string, string> = {
    '/p/openspec/specs/user-auth/spec.md':
      '# user-auth Specification\n\n## Purpose\nAuth.\n\n## Requirements\n### Requirement: Login\nSHALL log in.\n\n#### Scenario: ok\n- **WHEN** a\n- **THEN** b\n',
    '/p/openspec/changes/add-thing/.openspec.yaml': 'schema: spec-driven\ncreated: 2026-08-01\n',
    '/p/openspec/changes/add-thing/proposal.md': '## Why\nbecause\n',
    '/p/openspec/changes/only-proposal/.openspec.yaml': 'schema: spec-driven\n',
    '/p/openspec/changes/only-proposal/proposal.md': '## Why\nbecause\n',
    '/p/openspec/changes/archive/2026-07-01-old-thing/.openspec.yaml': 'schema: spec-driven\n',
    '/p/openspec/changes/archive/2026-07-01-old-thing/proposal.md': '## Why\nold\n',
  };

  it('separates active from archived and strips the date prefix', async () => {
    const result = await readProject(new MemoryFileSource(files), '/p');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const archived = result.snapshot.changes.filter((c) => c.location === 'archived');
    expect(archived.map((c) => c.name)).toEqual(['old-thing']);
    expect(archived[0]?.archivedOn).toBe('2026-07-01');
    expect(archived[0]?.lane).toBe('archived');
  });

  it('derives a proposed lane for a change with only a proposal', async () => {
    const result = await readProject(new MemoryFileSource(files), '/p');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const change = result.snapshot.changes.find((c) => c.name === 'only-proposal');
    expect(change?.lane).toBe('proposed');
    expect(change?.artifacts.find((a) => a.id === 'tasks')?.status).toBe('blocked');
    expect(change?.artifacts.find((a) => a.id === 'specs')?.status).toBe('ready');
  });

  it('reports a directory that is not an OpenSpec project', async () => {
    const result = await readProject(new MemoryFileSource({ '/q/readme.md': 'hi' }), '/q');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.problem).toBe('not-openspec');
  });

  it('reports a path that does not exist', async () => {
    const result = await readProject(new MemoryFileSource({}), '/nope');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.problem).toBe('path-missing');
  });
});

describe('readProject on specdeck itself', () => {
  it('reads its own OpenSpec state', async () => {
    // The dogfooding assertion. If specdeck cannot read the repository it lives
    // in, nothing else it reports can be trusted.
    const result = await readProject(new NodeFileSource(), repoRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const change = result.snapshot.changes.find((c) => c.name === 'add-specdeck-mvp');
    expect(change).toBeDefined();
    expect(change?.metadata.schema).toBe('spec-driven');
    expect(change?.artifacts.every((a) => a.status === 'done')).toBe(true);
    expect(change?.tasks.total).toBeGreaterThan(50);
    expect(change?.tasks.completed).toBeGreaterThan(0);

    // The lane is asserted against the task counts rather than pinned to a
    // value. An earlier version of this test hardcoded 'in-progress', which was
    // true the afternoon it was written and broke the moment the last task was
    // ticked. Deriving the expectation the same way the product does is the
    // actual invariant worth protecting, and it never goes stale.
    const { completed, total } = change?.tasks ?? { completed: 0, total: 0 };
    const expectedLane = completed === 0 ? 'ready' : completed >= total ? 'done' : 'in-progress';
    expect(change?.lane).toBe(expectedLane);
    expect(change?.capabilities).toContain('git-sync');
    expect(change?.deltaSpecs).toHaveLength(9);

    // Every delta spec should parse cleanly. A failure here means the artifacts
    // written earlier in this project do not match what OpenSpec expects.
    const errors = change?.deltaSpecs.flatMap((d) =>
      d.issues.filter((i) => i.severity === 'error'),
    );
    expect(errors).toEqual([]);
  });
});
