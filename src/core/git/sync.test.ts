import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { inspectRepo, readFetchAge } from './repo.js';
import { computeSync, summarizeChange } from './sync.js';

/**
 * These run against real repositories rather than mocks.
 *
 * Every guard in the sync layer exists because of behavior git actually has on
 * a particular repository shape, and a mock would simply reproduce whatever the
 * implementation already assumes.
 */

const roots: string[] = [];

function sandbox(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `specdeck-git-${name}-`));
  roots.push(dir);
  return dir;
}

function run(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

function initRepo(dir: string): void {
  run(dir, 'init', '--quiet', '--initial-branch=main');
  run(dir, 'config', 'user.email', 'test@example.com');
  run(dir, 'config', 'user.name', 'specdeck test');
  run(dir, 'config', 'commit.gpgsign', 'false');
}

function writeSpec(dir: string, relative: string, content: string): void {
  const path = join(dir, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

afterAll(() => {
  for (const dir of roots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows occasionally holds a handle on a just-closed git process.
    }
  }
});

describe('capability guards', () => {
  it('reports a directory that is not a repository', async () => {
    const dir = sandbox('plain');
    const capability = await inspectRepo(dir);
    expect(capability.problem).toBe('not-a-repo');
  });

  it('reports a repository with no commits', async () => {
    const dir = sandbox('empty');
    initRepo(dir);
    writeSpec(dir, 'openspec/changes/a/proposal.md', '## Why\n');
    const capability = await inspectRepo(dir);
    expect(capability.problem).toBe('no-commits');
  });

  it('reports a repository with commits but no remote', async () => {
    const dir = sandbox('noremote');
    initRepo(dir);
    writeSpec(dir, 'openspec/changes/a/proposal.md', '## Why\n');
    run(dir, 'add', '-A');
    run(dir, 'commit', '--quiet', '-m', 'first');
    const capability = await inspectRepo(dir);
    expect(capability.problem).toBe('no-remote-ref');
  });

  it('never reports everything as synced when the remote cannot be resolved', async () => {
    // This is the failure that motivated the guards. An unguarded empty diff is
    // indistinguishable from everything matching, so a repository with no remote
    // would paint entirely green.
    const dir = sandbox('nosync');
    initRepo(dir);
    writeSpec(dir, 'openspec/changes/a/proposal.md', '## Why\n');
    run(dir, 'add', '-A');
    run(dir, 'commit', '--quiet', '-m', 'first');
    writeSpec(dir, 'openspec/changes/a/design.md', '## Context\n');

    const summary = await computeSync(dir);
    expect(summary.problem).toBe('no-remote-ref');
    expect(summary.remoteRef).toBeUndefined();
    // Uncommitted work is still real without a remote, so it is still reported.
    expect(summary.files['openspec/changes/a/design.md']).toBe('uncommitted');
    const change = summarizeChange(summary, 'openspec/changes/a');
    expect(change.synced).toBe(false);
    expect(change.uncommitted).toBe(1);
  });
});

describe('sync against a real remote', () => {
  let work: string;

  beforeAll(() => {
    const bare = sandbox('bare');
    run(bare, 'init', '--quiet', '--bare', '--initial-branch=main');

    const seed = sandbox('seed');
    initRepo(seed);
    writeSpec(seed, 'openspec/changes/shared/proposal.md', '## Why\nshared\n');
    writeSpec(seed, 'openspec/changes/shared/design.md', '## Context\nshared\n');
    writeSpec(seed, 'openspec/changes/teammate-only/proposal.md', '## Why\ntheirs\n');
    run(seed, 'add', '-A');
    run(seed, 'commit', '--quiet', '-m', 'seed');
    run(seed, 'remote', 'add', 'origin', bare);
    run(seed, 'push', '--quiet', '-u', 'origin', 'main');

    work = sandbox('work');
    run(work, 'clone', '--quiet', bare, '.');
    run(work, 'config', 'user.email', 'test@example.com');
    run(work, 'config', 'user.name', 'specdeck test');
    run(work, 'config', 'commit.gpgsign', 'false');

    // A change that exists only here, committed but never pushed.
    writeSpec(work, 'openspec/changes/mine/proposal.md', '## Why\nmine\n');
    // An edit to a shared file, committed but never pushed.
    writeSpec(work, 'openspec/changes/shared/design.md', '## Context\nchanged locally\n');
    run(work, 'add', '-A');
    run(work, 'commit', '--quiet', '-m', 'local work');

    // Delete a file the remote still has.
    rmSync(join(work, 'openspec/changes/teammate-only/proposal.md'));
    run(work, 'add', '-A');
    run(work, 'commit', '--quiet', '-m', 'drop theirs');

    // Written after the last commit, so it stays uncommitted. This is how an
    // agent leaves a spec it has just generated.
    writeSpec(work, 'openspec/changes/shared/tasks.md', '- [ ] 1.1 not committed\n');
  });

  it('resolves the upstream reference', async () => {
    const capability = await inspectRepo(work);
    expect(capability.problem).toBeUndefined();
    expect(capability.remoteRef).toBe('origin/main');
    expect(capability.branch).toBe('main');
  });

  it('separates uncommitted, ahead, and behind', async () => {
    const summary = await computeSync(work);
    expect(summary.available).toBe(true);
    expect(summary.files['openspec/changes/mine/proposal.md']).toBe('ahead');
    expect(summary.files['openspec/changes/shared/design.md']).toBe('ahead');
    expect(summary.files['openspec/changes/shared/tasks.md']).toBe('uncommitted');
    expect(summary.files['openspec/changes/teammate-only/proposal.md']).toBe('behind');
  });

  it('leaves an untouched file out of the map entirely, which reads as synced', async () => {
    const summary = await computeSync(work);
    expect(summary.files['openspec/changes/shared/proposal.md']).toBeUndefined();
  });

  it('rolls per-file state up to a change', async () => {
    const summary = await computeSync(work);
    expect(summarizeChange(summary, 'openspec/changes/mine')).toEqual({
      uncommitted: 0,
      ahead: 1,
      behind: 0,
      synced: false,
    });
    expect(summarizeChange(summary, 'openspec/changes/shared')).toEqual({
      uncommitted: 1,
      ahead: 1,
      behind: 0,
      synced: false,
    });
  });

  it('counts commits on each side of the merge base', async () => {
    const summary = await computeSync(work);
    expect(summary.aheadCommits).toBe(2);
    expect(summary.behindCommits).toBe(0);
  });

  it('does not report line ending differences as modifications', async () => {
    // Under Windows-default autocrlf, `git status --porcelain` reports a file
    // rewritten with different line endings as modified, permanently. Agents
    // write markdown with LF into CRLF checkouts constantly, so a status-based
    // board would mark every agent-touched spec dirty forever.
    const dir = sandbox('crlf');
    initRepo(dir);
    run(dir, 'config', 'core.autocrlf', 'true');
    writeSpec(dir, 'openspec/changes/a/tasks.md', '- [ ] 1.1 one\r\n- [ ] 1.2 two\r\n');
    run(dir, 'add', '-A');
    run(dir, 'commit', '--quiet', '-m', 'seed');

    // Rewrite the identical content with LF endings, as an agent would.
    writeSpec(dir, 'openspec/changes/a/tasks.md', '- [ ] 1.1 one\n- [ ] 1.2 two\n');

    const summary = await computeSync(dir);
    expect(summary.files['openspec/changes/a/tasks.md']).toBeUndefined();
  });
});

describe('readFetchAge', () => {
  it('reports never fetched when there is no FETCH_HEAD', () => {
    const dir = sandbox('fetchage');
    initRepo(dir);
    expect(readFetchAge(join(dir, '.git')).neverFetched).toBe(true);
  });

  it('reports never fetched when the git directory is unknown', () => {
    expect(readFetchAge(undefined).neverFetched).toBe(true);
  });
});
