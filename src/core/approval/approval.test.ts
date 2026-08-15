import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { approveChange, preflightApproval } from './commit.js';
import { deriveApproval } from './derive.js';

/**
 * Approval is exercised against real repositories rather than a mock, because
 * every property worth protecting is a property of what git actually does:
 * that a pathspec commit leaves the index alone, that an already-committed
 * change can still be approved, and that any later edit invalidates it.
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

function run(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/**
 * Like `run`, but only the trailing newline is stripped.
 *
 * Porcelain status encodes staged versus unstaged in the first two columns, so
 * a leading space is load-bearing and trimming it would erase the distinction
 * these tests exist to check.
 */
function runRaw(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).replace(/\r?\n$/, '');
}

interface Fixture {
  root: string;
  changeDir: string;
}

function buildRepo(options: { identity?: boolean } = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'specdeck-approval-'));
  roots.push(root);

  run(root, ['init', '--quiet', '--initial-branch=main']);
  if (options.identity !== false) {
    run(root, ['config', 'user.email', 'reviewer@example.com']);
    run(root, ['config', 'user.name', 'Reviewer']);
  }
  // Keep the fixture independent of the machine's signing configuration.
  run(root, ['config', 'commit.gpgsign', 'false']);

  const changeDir = join(root, 'openspec/changes/add-thing');
  mkdirSync(changeDir, { recursive: true });
  mkdirSync(join(root, 'other'), { recursive: true });
  writeFileSync(join(changeDir, 'proposal.md'), '## Why\nreasons\n');
  writeFileSync(join(root, 'other/unrelated.txt'), 'untouched\n');

  run(root, ['add', '-A']);
  run(root, ['commit', '--quiet', '-m', 'init']);

  return { root, changeDir };
}

describe('deriving approval', () => {
  it('reports a change nobody has approved as never approved', async () => {
    const { root, changeDir } = buildRepo();
    const approval = await deriveApproval(root, 'add-thing', changeDir);

    expect(approval.state).toBe('never-approved');
    expect(approval.latest).toBeUndefined();
  });

  it('reports approval with the approver and time after approving', async () => {
    const { root, changeDir } = buildRepo();
    const outcome = await approveChange(root, 'add-thing', changeDir);
    expect(outcome.ok).toBe(true);

    const approval = await deriveApproval(root, 'add-thing', changeDir);
    expect(approval.state).toBe('approved');
    expect(approval.latest?.approver.name).toBe('Reviewer');
    expect(approval.latest?.approver.email).toBe('reviewer@example.com');
    expect(approval.latest?.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('approves a change whose files are already committed', async () => {
    // The common case, and the one a plain `git commit -- path` refuses.
    const { root, changeDir } = buildRepo();
    expect(run(root, ['status', '--porcelain'])).toBe('');

    const outcome = await approveChange(root, 'add-thing', changeDir);
    expect(outcome.ok).toBe(true);
    expect((await deriveApproval(root, 'add-thing', changeDir)).state).toBe('approved');
  });

  it('lapses to needs review when an artifact is edited afterwards', async () => {
    const { root, changeDir } = buildRepo();
    await approveChange(root, 'add-thing', changeDir);

    writeFileSync(join(changeDir, 'proposal.md'), '## Why\ndifferent reasons\n');

    const approval = await deriveApproval(root, 'add-thing', changeDir);
    expect(approval.state).toBe('needs-review');
    expect(approval.drift).toContain('openspec/changes/add-thing/proposal.md');
    // The approval itself is still reported, so the interface can say who
    // approved what, and when it stopped applying.
    expect(approval.latest?.approver.name).toBe('Reviewer');
  });

  it('lapses when a new artifact is committed over an approved change', async () => {
    const { root, changeDir } = buildRepo();
    await approveChange(root, 'add-thing', changeDir);

    writeFileSync(join(changeDir, 'design.md'), '## Context\nlater\n');
    run(root, ['add', '-A']);
    run(root, ['commit', '--quiet', '-m', 'add design']);

    const approval = await deriveApproval(root, 'add-thing', changeDir);
    expect(approval.state).toBe('needs-review');
    expect(approval.drift).toContain('openspec/changes/add-thing/design.md');
  });

  it('returns to approved when the edit is reverted', async () => {
    const { root, changeDir } = buildRepo();
    await approveChange(root, 'add-thing', changeDir);

    writeFileSync(join(changeDir, 'proposal.md'), '## Why\ndifferent reasons\n');
    expect((await deriveApproval(root, 'add-thing', changeDir)).state).toBe('needs-review');

    writeFileSync(join(changeDir, 'proposal.md'), '## Why\nreasons\n');
    expect((await deriveApproval(root, 'add-thing', changeDir)).state).toBe('approved');
  });

  it('records a second approval without erasing the first', async () => {
    const { root, changeDir } = buildRepo();
    await approveChange(root, 'add-thing', changeDir);
    const first = await deriveApproval(root, 'add-thing', changeDir);

    writeFileSync(join(changeDir, 'proposal.md'), '## Why\nrevised\n');
    await approveChange(root, 'add-thing', changeDir);
    const second = await deriveApproval(root, 'add-thing', changeDir);

    expect(second.state).toBe('approved');
    expect(second.latest?.commit).not.toBe(first.latest?.commit);

    const approvals = run(root, ['log', '--format=%s', '--grep', 'Approved-change: add-thing']);
    expect(approvals.split('\n')).toHaveLength(2);
  });

  it('does not treat another change’s approval as this one’s', async () => {
    const { root, changeDir } = buildRepo();
    const other = join(root, 'openspec/changes/other-thing');
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, 'proposal.md'), '## Why\nother\n');
    run(root, ['add', '-A']);
    run(root, ['commit', '--quiet', '-m', 'add other']);

    await approveChange(root, 'other-thing', other);

    expect((await deriveApproval(root, 'add-thing', changeDir)).state).toBe('never-approved');
    expect((await deriveApproval(root, 'other-thing', other)).state).toBe('approved');
  });

  it('reports unknown rather than unapproved outside a repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'specdeck-norepo-'));
    roots.push(dir);
    mkdirSync(join(dir, 'openspec/changes/add-thing'), { recursive: true });

    const approval = await deriveApproval(
      dir,
      'add-thing',
      join(dir, 'openspec/changes/add-thing'),
    );
    expect(approval.state).toBe('unknown');
    expect(approval.reason).toBeTruthy();
  });
});

describe('approving commits only the change', () => {
  it('leaves unrelated staged work staged and uncommitted', async () => {
    const { root, changeDir } = buildRepo();

    writeFileSync(join(root, 'other/unrelated.txt'), 'staged edit\n');
    run(root, ['add', 'other/unrelated.txt']);
    writeFileSync(join(changeDir, 'proposal.md'), '## Why\nedited\n');

    const outcome = await approveChange(root, 'add-thing', changeDir);
    expect(outcome.ok).toBe(true);

    // Still staged, still uncommitted. This is the property the pathspec form
    // exists for: approving must never sweep in a user's unrelated work.
    expect(runRaw(root, ['status', '--porcelain'])).toBe('M  other/unrelated.txt');

    const touched = run(root, ['show', '--name-only', '--format=', 'HEAD']);
    expect(touched).toBe('openspec/changes/add-thing/proposal.md');
  });

  it('leaves unrelated uncommitted work alone', async () => {
    const { root, changeDir } = buildRepo();
    writeFileSync(join(root, 'other/unrelated.txt'), 'working edit\n');

    await approveChange(root, 'add-thing', changeDir);

    expect(runRaw(root, ['status', '--porcelain'])).toBe(' M other/unrelated.txt');
  });
});

describe('a commit hook that rejects an approval', () => {
  it('reports the hook output rather than bypassing it', async () => {
    const { root, changeDir } = buildRepo();

    const hooks = join(root, '.git', 'hooks');
    mkdirSync(hooks, { recursive: true });
    writeFileSync(
      join(hooks, 'commit-msg'),
      '#!/bin/sh\necho "policy: approvals are not allowed here" >&2\nexit 1\n',
      { mode: 0o755 },
    );

    const outcome = await approveChange(root, 'add-thing', changeDir);

    expect(outcome.ok).toBe(false);
    expect(outcome.exitCode).toBeGreaterThan(0);
    // The hook's own words, not a paraphrase.
    expect(outcome.output).toContain('approvals are not allowed here');
    // And nothing was recorded, so the change is still unapproved.
    expect((await deriveApproval(root, 'add-thing', changeDir)).state).toBe('never-approved');
  });
});

describe('a project reached through a differently spelled path', () => {
  /**
   * The caller's spelling of a path and git's need not match even when they name
   * the same directory. macOS reaches `/var` through a symlink to `/private/var`,
   * which is where every temporary directory on that platform lives, and the
   * Windows CI runner's TEMP is an 8.3 short name like `RUNNER~1` where git
   * reports the long one.
   *
   * Comparing those two spellings as strings yields a path starting with `..`,
   * which reads as "outside the repository" and silently disables approval
   * entirely: every state comes back unknown and approving is refused. This is
   * not a test-only condition; any project under a symlinked directory hits it.
   */
  function aliasedFixture(): Fixture | undefined {
    const parent = mkdtempSync(join(tmpdir(), 'specdeck-aliased-'));
    roots.push(parent);

    const real = join(parent, 'real');
    const alias = join(parent, 'alias');
    mkdirSync(real);

    run(real, ['init', '--quiet', '--initial-branch=main']);
    run(real, ['config', 'user.email', 'reviewer@example.com']);
    run(real, ['config', 'user.name', 'Reviewer']);
    run(real, ['config', 'commit.gpgsign', 'false']);
    mkdirSync(join(real, 'openspec/changes/add-thing'), { recursive: true });
    writeFileSync(join(real, 'openspec/changes/add-thing/proposal.md'), '## Why\nreasons\n');
    run(real, ['add', '-A']);
    run(real, ['commit', '--quiet', '-m', 'init']);

    try {
      symlinkSync(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      // Some Windows configurations refuse even a junction. Skipping is honest;
      // the platforms where this matters most run it.
      return undefined;
    }

    return { root: alias, changeDir: join(alias, 'openspec/changes/add-thing') };
  }

  it('reads approval through the alias rather than reporting it unknown', async () => {
    const fixture = aliasedFixture();
    if (fixture === undefined) return;

    const before = await deriveApproval(fixture.root, 'add-thing', fixture.changeDir);
    expect(before.state).toBe('never-approved');

    const outcome = await approveChange(fixture.root, 'add-thing', fixture.changeDir);
    expect(outcome.ok, outcome.message).toBe(true);

    const after = await deriveApproval(fixture.root, 'add-thing', fixture.changeDir);
    expect(after.state).toBe('approved');
  });

  it('still detects drift through the alias', async () => {
    const fixture = aliasedFixture();
    if (fixture === undefined) return;

    await approveChange(fixture.root, 'add-thing', fixture.changeDir);
    writeFileSync(join(fixture.changeDir, 'proposal.md'), '## Why\nchanged\n');

    const approval = await deriveApproval(fixture.root, 'add-thing', fixture.changeDir);
    expect(approval.state).toBe('needs-review');
    expect(approval.drift).toContain('openspec/changes/add-thing/proposal.md');
  });

  it('does not refuse the preflight as outside the repository', async () => {
    const fixture = aliasedFixture();
    if (fixture === undefined) return;

    const preflight = await preflightApproval(fixture.root, 'add-thing', fixture.changeDir);
    expect(preflight.blocker).not.toBe('outside-repo');
    expect(preflight.ok, preflight.message).toBe(true);
  });
});

describe('approval preflight', () => {
  it('lists the uncommitted files approving would commit', async () => {
    const { root, changeDir } = buildRepo();
    writeFileSync(join(changeDir, 'tasks.md'), '## 1. G\n\n- [ ] 1.1 do it\n');

    const preflight = await preflightApproval(root, 'add-thing', changeDir);
    expect(preflight.ok).toBe(true);
    expect(preflight.uncommitted).toContain('openspec/changes/add-thing/tasks.md');
    expect(preflight.approver?.name).toBe('Reviewer');
  });

  it('refuses outside a repository', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'specdeck-norepo-'));
    roots.push(dir);
    mkdirSync(join(dir, 'openspec/changes/add-thing'), { recursive: true });

    const preflight = await preflightApproval(
      dir,
      'add-thing',
      join(dir, 'openspec/changes/add-thing'),
    );
    expect(preflight.ok).toBe(false);
    expect(preflight.blocker).toBe('not-a-repo');
    expect(preflight.message).toMatch(/recorded as a commit/i);
  });

  it('refuses a repository with no commits', async () => {
    const root = mkdtempSync(join(tmpdir(), 'specdeck-empty-'));
    roots.push(root);
    run(root, ['init', '--quiet', '--initial-branch=main']);
    run(root, ['config', 'user.email', 'r@e.com']);
    run(root, ['config', 'user.name', 'R']);
    const changeDir = join(root, 'openspec/changes/add-thing');
    mkdirSync(changeDir, { recursive: true });

    const preflight = await preflightApproval(root, 'add-thing', changeDir);
    expect(preflight.ok).toBe(false);
    expect(preflight.blocker).toBe('no-commits');
  });

  it('refuses with the fix when git has no identity', async () => {
    const { root, changeDir } = buildRepo();
    // Local identity is what the fixture set; unsetting it leaves whatever the
    // machine has globally, so the test only runs where that is genuinely empty.
    run(root, ['config', '--unset', 'user.name']);
    run(root, ['config', '--unset', 'user.email']);

    const preflight = await preflightApproval(root, 'add-thing', changeDir);
    if (preflight.blocker !== 'no-identity') {
      expect(preflight.ok).toBe(true);
      return;
    }

    expect(preflight.ok).toBe(false);
    expect(preflight.remedy?.join(' ')).toMatch(/git config .*user\.email/);
  });

  it('refuses on a detached HEAD', async () => {
    const { root, changeDir } = buildRepo();
    run(root, ['checkout', '--quiet', '--detach', 'HEAD']);

    const preflight = await preflightApproval(root, 'add-thing', changeDir);
    expect(preflight.ok).toBe(false);
    expect(preflight.blocker).toBe('detached-head');

    // And the refusal holds through the action, not only the preflight.
    const outcome = await approveChange(root, 'add-thing', changeDir);
    expect(outcome.ok).toBe(false);
    expect(outcome.blocker).toBe('detached-head');
  });
});
