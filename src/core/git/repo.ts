import { statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { git } from './run.js';

/**
 * Repository capability guards and reference resolution.
 *
 * Every guard here exists because its failure mode is silent and wrong rather
 * than loud. If the remote reference cannot be resolved and the error is
 * swallowed, the file difference comes back empty, which is indistinguishable
 * from everything matching. The board would then paint a repository with no
 * remote at all as entirely in sync, which is the worst possible outcome for a
 * signal whose entire job is to be trusted.
 */

export type GitProblem = 'not-a-repo' | 'no-commits' | 'no-remote-ref' | 'git-missing' | 'failed';

export interface GitCapability {
  problem?: GitProblem;
  /** Written for a user reading it in the interface. */
  message?: string;
  /** Absolute repository root, when there is one. */
  root?: string;
  /** Absolute path to the git directory, which is not always `<root>/.git`. */
  gitDir?: string;
  /** The remote-tracking reference comparisons run against. */
  remoteRef?: string;
  /** Current branch, when not detached. */
  branch?: string;
}

async function resolveGitDir(cwd: string): Promise<string | undefined> {
  const result = await git(['rev-parse', '--absolute-git-dir'], { cwd });
  if (!result.ok) return undefined;
  const value = result.stdout.trim();
  return value === '' ? undefined : value;
}

/**
 * Determines what git can tell us about this project.
 *
 * Returns a problem rather than throwing, because every problem here is a normal
 * state some real project is in.
 */
export async function inspectRepo(projectRoot: string): Promise<GitCapability> {
  const top = await git(['rev-parse', '--show-toplevel'], { cwd: projectRoot });
  if (!top.ok) {
    // A missing git binary and a non-repository directory are different
    // situations with different remedies, so they get different messages.
    if (/ENOENT|not recognized|not found/i.test(top.stderr)) {
      return {
        problem: 'git-missing',
        message: 'git is not on your PATH, so sync state and timelines are unavailable.',
      };
    }
    return {
      problem: 'not-a-repo',
      message:
        'This project is not inside a git repository, so there is nothing to compare against.',
    };
  }

  const root = top.stdout.trim();
  const gitDir = await resolveGitDir(projectRoot);

  const head = await git(['rev-parse', '--verify', 'HEAD'], { cwd: projectRoot });
  if (!head.ok) {
    const capability: GitCapability = {
      problem: 'no-commits',
      message:
        'This repository has no commits yet, so there is nothing committed to compare against.',
      root,
    };
    if (gitDir !== undefined) capability.gitDir = gitDir;
    return capability;
  }

  const branchResult = await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: projectRoot });
  const branchName = branchResult.ok ? branchResult.stdout.trim() : '';
  const branch = branchName === '' || branchName === 'HEAD' ? undefined : branchName;

  const remoteRef = await resolveRemoteRef(projectRoot);
  if (remoteRef === undefined) {
    const capability: GitCapability = {
      problem: 'no-remote-ref',
      message:
        'No remote branch could be resolved for this repository, so specdeck cannot tell what is pushed.',
      root,
    };
    if (gitDir !== undefined) capability.gitDir = gitDir;
    if (branch !== undefined) capability.branch = branch;
    return capability;
  }

  const capability: GitCapability = { root, remoteRef };
  if (gitDir !== undefined) capability.gitDir = gitDir;
  if (branch !== undefined) capability.branch = branch;
  return capability;
}

/**
 * Finds the reference to compare against, in decreasing order of confidence.
 *
 * The upstream of the current branch is the truth when it is configured. Failing
 * that, the remote's default branch is the best guess, because a branch with no
 * upstream is extremely common on a freshly created feature branch.
 */
export async function resolveRemoteRef(cwd: string): Promise<string | undefined> {
  const upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], {
    cwd,
  });
  if (upstream.ok) {
    const value = upstream.stdout.trim();
    if (value !== '') return value;
  }

  const originHead = await git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd });
  if (originHead.ok) {
    const value = originHead.stdout.trim();
    if (value !== '' && (await refExists(cwd, value))) return value;
  }

  for (const candidate of ['origin/main', 'origin/master']) {
    if (await refExists(cwd, candidate)) return candidate;
  }

  return undefined;
}

async function refExists(cwd: string, ref: string): Promise<boolean> {
  const result = await git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd });
  return result.ok && result.stdout.trim() !== '';
}

export interface FetchAge {
  /** Milliseconds since the last successful fetch, when one is recorded. */
  ageMs?: number;
  /** True when the repository has never fetched since being cloned. */
  neverFetched: boolean;
}

/**
 * Reports how stale the remote view is.
 *
 * The git directory is resolved rather than assumed, because a linked worktree
 * keeps its own, and reading the wrong one would report another worktree's
 * freshness as this one's.
 */
export function readFetchAge(gitDir: string | undefined, now: number = Date.now()): FetchAge {
  if (gitDir === undefined || !isAbsolute(gitDir)) return { neverFetched: true };
  try {
    const stats = statSync(join(gitDir, 'FETCH_HEAD'));
    return { ageMs: Math.max(0, now - stats.mtimeMs), neverFetched: false };
  } catch {
    return { neverFetched: true };
  }
}

/**
 * Fetches the remote without ever blocking on credentials.
 */
export async function fetchRemote(cwd: string): Promise<{ ok: boolean; message?: string }> {
  const result = await git(['fetch', '--quiet', '--no-tags'], { cwd, timeoutMs: 30_000 });
  if (result.ok) return { ok: true };
  const detail = (result.stderr || result.stdout).trim().split('\n')[0] ?? 'unknown error';
  return { ok: false, message: `Could not reach the remote: ${detail}` };
}

export interface PullOutcome {
  ok: boolean;
  /** Written for a user reading it in the interface. */
  message: string;
  /** Raw git output, shown when it failed so the real reason is visible. */
  detail?: string;
}

/**
 * Brings the current branch up to date, fast-forward only.
 *
 * `--ff-only` is deliberate. A plain pull can create a merge commit or drop the
 * user into a conflicted working tree, and a local dashboard silently
 * restructuring someone's history because they clicked a small link would be
 * indefensible. Fast-forward either applies cleanly or refuses, and a refusal
 * comes back with git's own reason plus the command to run by hand.
 */
export async function pullFastForward(cwd: string): Promise<PullOutcome> {
  const dirty = await git(['status', '--porcelain', '--untracked-files=no'], { cwd });
  if (dirty.ok && dirty.stdout.trim() !== '') {
    return {
      ok: false,
      message:
        'You have uncommitted changes, so specdeck did not pull. Commit or stash them first, ' +
        'then pull again.',
      detail: dirty.stdout.trim(),
    };
  }

  const result = await git(['pull', '--ff-only'], { cwd, timeoutMs: 60_000 });
  if (result.ok) {
    return { ok: true, message: (result.stdout || 'Already up to date.').trim() };
  }

  const detail = (result.stderr || result.stdout).trim();
  const cannotFastForward = /not possible to fast-forward|diverging|Need to specify/i.test(detail);

  return {
    ok: false,
    message: cannotFastForward
      ? 'Your branch and the remote have both moved, so this cannot fast-forward. ' +
        'Merge or rebase yourself, then specdeck will catch up.'
      : 'The pull did not complete.',
    detail,
  };
}
