import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { historyForPrefix, readTaskHistory, readTreeHistory } from './history.js';

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

function run(cwd: string, args: string[], when?: string): void {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  if (when !== undefined) {
    Object.assign(env, { GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when });
  }
  execFileSync('git', args, { cwd, encoding: 'utf8', env });
}

function write(dir: string, relative: string, content: string): void {
  const path = join(dir, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

describe('git history', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'specdeck-history-'));
    roots.push(dir);
    run(dir, ['init', '--quiet', '--initial-branch=main']);
    run(dir, ['config', 'user.email', 't@e.com']);
    run(dir, ['config', 'user.name', 't']);
    run(dir, ['config', 'commit.gpgsign', 'false']);

    // Three commits with controlled dates, so first and last are unambiguous.
    write(dir, 'openspec/changes/add-auth/proposal.md', '## Why\nfirst\n');
    run(dir, ['add', '-A']);
    run(dir, ['commit', '--quiet', '-m', 'propose auth'], '2026-01-10T09:00:00+00:00');

    write(dir, 'openspec/changes/add-auth/tasks.md', '## 1. G\n\n- [ ] 1.1 one\n- [ ] 1.2 two\n');
    run(dir, ['add', '-A']);
    run(dir, ['commit', '--quiet', '-m', 'add tasks'], '2026-01-12T09:00:00+00:00');

    write(dir, 'openspec/changes/add-auth/tasks.md', '## 1. G\n\n- [x] 1.1 one\n- [ ] 1.2 two\n');
    run(dir, ['add', '-A']);
    run(dir, ['commit', '--quiet', '-m', 'finish one'], '2026-01-15T09:00:00+00:00');

    write(dir, 'openspec/changes/add-auth/tasks.md', '## 1. G\n\n- [x] 1.1 one\n- [x] 1.2 two\n');
    write(dir, 'openspec/changes/other/proposal.md', '## Why\nother\n');
    run(dir, ['add', '-A']);
    run(dir, ['commit', '--quiet', '-m', 'finish two'], '2026-01-20T09:00:00+00:00');
  });

  it('reports first and last activity per file from one log call', async () => {
    const history = await readTreeHistory(dir);
    expect(history.available).toBe(true);

    const proposal = history.paths['openspec/changes/add-auth/proposal.md'];
    expect(proposal?.firstWorked.slice(0, 10)).toBe('2026-01-10');
    expect(proposal?.lastWorked.slice(0, 10)).toBe('2026-01-10');
    expect(proposal?.commits).toBe(1);

    const tasks = history.paths['openspec/changes/add-auth/tasks.md'];
    expect(tasks?.firstWorked.slice(0, 10)).toBe('2026-01-12');
    expect(tasks?.lastWorked.slice(0, 10)).toBe('2026-01-20');
    expect(tasks?.commits).toBe(3);
  });

  it('rolls a change up from its files', async () => {
    const history = await readTreeHistory(dir);
    const change = historyForPrefix(history, 'openspec/changes/add-auth');
    // Started when the proposal landed, last touched when the final task was ticked.
    expect(change?.firstWorked.slice(0, 10)).toBe('2026-01-10');
    expect(change?.lastWorked.slice(0, 10)).toBe('2026-01-20');
    expect(change?.commits).toBe(4);
  });

  it('returns undefined for a change with no committed files', async () => {
    // The normal state for a change an agent has just written.
    const history = await readTreeHistory(dir);
    expect(historyForPrefix(history, 'openspec/changes/never-committed')).toBeUndefined();
  });

  it('does not let one change bleed into another', async () => {
    const history = await readTreeHistory(dir);
    const other = historyForPrefix(history, 'openspec/changes/other');
    expect(other?.firstWorked.slice(0, 10)).toBe('2026-01-20');
    expect(other?.commits).toBe(1);
  });

  it('reconstructs when individual tasks were ticked', async () => {
    const result = await readTaskHistory(dir, 'openspec/changes/add-auth/tasks.md');
    expect(result.available).toBe(true);

    const byId = new Map(result.events.map((e) => [e.id, e]));
    expect(byId.get('1.1')?.when.slice(0, 10)).toBe('2026-01-15');
    expect(byId.get('1.2')?.when.slice(0, 10)).toBe('2026-01-20');
    expect(byId.get('1.1')?.text).toBe('one');
  });

  it('reports events in the order they happened', async () => {
    const result = await readTaskHistory(dir, 'openspec/changes/add-auth/tasks.md');
    const order = result.events.map((e) => e.id);
    expect(order).toEqual(['1.1', '1.2']);
  });

  it('degrades rather than throwing on a repository with no commits', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'specdeck-history-empty-'));
    roots.push(empty);
    run(empty, ['init', '--quiet', '--initial-branch=main']);

    const history = await readTreeHistory(empty);
    expect(history.available).toBe(false);
    expect(history.reason).toBeDefined();
    expect(history.paths).toEqual({});
  });
});
