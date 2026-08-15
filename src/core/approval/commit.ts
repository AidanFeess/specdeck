import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { git } from '../git/run.js';
import { inspectRepo, repoRelativePath } from '../git/repo.js';
import { CHANGE_TRAILER, APPROVER_TRAILER } from './types.js';
import type { Approver } from './types.js';

/**
 * Recording approval.
 *
 * Approval is the one action in specdeck that does not degrade gracefully. A
 * half-recorded approval is worse than none, so every condition that would make
 * the commit wrong is checked first and refused with the specific reason,
 * rather than attempted and reported afterwards.
 */

export type ApprovalBlocker =
  | 'git-missing'
  | 'not-a-repo'
  | 'no-commits'
  | 'detached-head'
  | 'mid-operation'
  | 'no-identity'
  | 'outside-repo';

export interface ApprovalPreflight {
  changeName: string;
  /** True when approval can proceed. */
  ok: boolean;
  blocker?: ApprovalBlocker;
  /** Written for a user reading it in the interface. */
  message?: string;
  /** Commands that would clear the blocker, for copying. */
  remedy?: string[];
  /** Who the approval would be attributed to. */
  approver?: Approver;
  /**
   * Files inside the change directory that are not committed yet.
   *
   * Approving commits these. The user is shown them first, because some of them
   * may be edits they had not realized were still uncommitted.
   */
  uncommitted: string[];
  /** The command specdeck would run, for copying. */
  command: string;
}

export interface ApprovalOutcome {
  ok: boolean;
  command: string;
  exitCode: number;
  output: string;
  message: string;
  blocker?: ApprovalBlocker;
}

function commitArgs(changeName: string, path: string, approver: Approver): string[] {
  // Both trailers go in one paragraph, because git only recognises a trailer
  // block as trailers when it is the last paragraph of the message.
  const trailers =
    `${CHANGE_TRAILER}: ${changeName}\n` +
    `${APPROVER_TRAILER}: ${approver.name} <${approver.email}>`;

  return [
    'commit',
    // An approval of an already-committed change has nothing to commit, and
    // that is the normal case rather than an error. The commit is still the
    // record, so it is allowed to be empty.
    '--allow-empty',
    '-m',
    `Approve ${changeName}`,
    '-m',
    trailers,
    // The pathspec is what keeps an approval honest. It commits these paths from
    // the working tree without touching the index, so a user's unrelated staged
    // work is neither committed nor unstaged by approving.
    '--',
    path,
  ];
}

/** The command specdeck would run, for the user to copy and run instead. */
export function approvalCommand(changeName: string, path: string): string {
  return `git commit --allow-empty -m "Approve ${changeName}" -m "${CHANGE_TRAILER}: ${changeName}..." -- ${path}`;
}

/**
 * Checks everything that would make an approval wrong, and reports what the
 * approval would cover.
 */
export async function preflightApproval(
  projectRoot: string,
  changeName: string,
  changeDir: string,
): Promise<ApprovalPreflight> {
  const base = { changeName, uncommitted: [] as string[], command: '' };

  const capability = await inspectRepo(projectRoot);
  // A missing remote is not a blocker: approval is local and needs no remote.
  if (
    capability.problem === 'git-missing' ||
    capability.problem === 'not-a-repo' ||
    capability.problem === 'no-commits'
  ) {
    return {
      ...base,
      ok: false,
      blocker: capability.problem,
      message: approvalContext(capability.problem, capability.message),
    };
  }

  const path = await repoRelativePath(projectRoot, changeDir);
  if (path === undefined) {
    return {
      ...base,
      ok: false,
      blocker: 'outside-repo',
      message: 'This change is not inside the repository, so it cannot be approved.',
    };
  }

  const command = approvalCommand(changeName, path);

  const branch = await git(['symbolic-ref', '--quiet', 'HEAD'], { cwd: projectRoot });
  if (!branch.ok) {
    return {
      ...base,
      command,
      ok: false,
      blocker: 'detached-head',
      message:
        'HEAD is detached, so an approval commit would not belong to any branch. Check out a branch first.',
    };
  }

  const operation = inProgressOperation(capability.gitDir);
  if (operation !== undefined) {
    return {
      ...base,
      command,
      ok: false,
      blocker: 'mid-operation',
      message: `A ${operation} is in progress. Finish or abort it before approving.`,
    };
  }

  const approver = await readIdentity(projectRoot);
  if (approver === undefined) {
    return {
      ...base,
      command,
      ok: false,
      blocker: 'no-identity',
      message:
        'git has no user name or email configured, so an approval could not say who approved it.',
      remedy: [
        'git config --global user.name "Your Name"',
        'git config --global user.email "you@example.com"',
      ],
    };
  }

  return {
    changeName,
    ok: true,
    approver,
    uncommitted: await uncommittedIn(projectRoot, path),
    command,
  };
}

/** Explains a repository problem in terms of what it means for approving. */
function approvalContext(problem: ApprovalBlocker, message: string | undefined): string {
  const suffix = 'Approval is recorded as a commit, so it needs a repository.';
  if (problem === 'no-commits') {
    return 'This repository has no commits yet. Make an initial commit before approving.';
  }
  return `${message ?? 'This project has no usable git repository.'} ${suffix}`;
}

/** Names an in-progress git operation, when one would make a commit confusing. */
function inProgressOperation(gitDir: string | undefined): string | undefined {
  if (gitDir === undefined) return undefined;
  if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))) {
    return 'rebase';
  }
  if (existsSync(join(gitDir, 'MERGE_HEAD'))) return 'merge';
  if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick';
  if (existsSync(join(gitDir, 'REVERT_HEAD'))) return 'revert';
  return undefined;
}

async function readIdentity(projectRoot: string): Promise<Approver | undefined> {
  const [name, email] = await Promise.all([
    git(['config', '--get', 'user.name'], { cwd: projectRoot }),
    git(['config', '--get', 'user.email'], { cwd: projectRoot }),
  ]);

  const approver = { name: name.stdout.trim(), email: email.stdout.trim() };
  return approver.name === '' || approver.email === '' ? undefined : approver;
}

async function uncommittedIn(projectRoot: string, path: string): Promise<string[]> {
  const status = await git(['status', '--porcelain', '--', path], { cwd: projectRoot });
  if (!status.ok) return [];

  const files: string[] = [];
  for (const line of status.stdout.split(/\r?\n/)) {
    const entry = line.slice(3).trim();
    if (entry !== '') files.push(entry);
  }
  return files.sort();
}

/**
 * Records the approval.
 *
 * Hooks are deliberately not bypassed. A commit hook that rejects an approval is
 * a hook doing its job, and its output is reported rather than worked around.
 */
export async function approveChange(
  projectRoot: string,
  changeName: string,
  changeDir: string,
): Promise<ApprovalOutcome> {
  const preflight = await preflightApproval(projectRoot, changeName, changeDir);
  if (!preflight.ok) {
    const outcome: ApprovalOutcome = {
      ok: false,
      command: preflight.command,
      exitCode: 1,
      output: '',
      message: preflight.message ?? 'This change cannot be approved.',
    };
    if (preflight.blocker !== undefined) outcome.blocker = preflight.blocker;
    return outcome;
  }

  const path = await repoRelativePath(projectRoot, changeDir);
  if (path === undefined || preflight.approver === undefined) {
    return {
      ok: false,
      command: preflight.command,
      exitCode: 1,
      output: '',
      message: 'This change cannot be approved.',
    };
  }

  const result = await git(commitArgs(changeName, path, preflight.approver), {
    cwd: projectRoot,
    timeoutMs: 30_000,
  });

  return {
    ok: result.ok,
    command: preflight.command,
    exitCode: result.code,
    output: `${result.stdout}${result.stderr}`.trim(),
    message: result.ok
      ? `Approved ${changeName}.`
      : 'The approval was not recorded. Nothing was committed.',
  };
}
