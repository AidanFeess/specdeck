import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { localFileSource } from '../core/fs/node-source.js';
import { readProject } from '../core/read/project.js';
import { findBundledOpenSpecRoot } from '../core/openspec/installed.js';
import { watchProject } from './watch.js';

/**
 * The archive burst is the specific failure coalescing exists to prevent.
 *
 * `openspec archive` deletes a change directory and recreates it elsewhere. Read
 * halfway through, the change has no artifacts, which derives cleanly to an
 * earlier lane. So a board that re-reads on every filesystem event shows a
 * finished change flickering backwards to Draft and then vanishing. Nothing
 * errors, and it looks completely broken.
 *
 * This test drives a real archive and records what a subscriber would have
 * rendered, asserting it never sees an intermediate state.
 */

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can hold a handle briefly after a child process exits.
    }
  }
});

function write(dir: string, relative: string, content: string): void {
  const path = join(dir, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function buildProject(): string {
  // The temp directory is resolved to its canonical form for the same reason
  // the watcher does it: on Windows a case or short-name mismatch makes libuv
  // abort the process rather than throw.
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'specdeck-burst-')));
  roots.push(dir);

  execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: dir });
  mkdirSync(join(dir, 'openspec/changes/archive'), { recursive: true });
  mkdirSync(join(dir, 'openspec/specs'), { recursive: true });

  write(
    dir,
    'openspec/changes/add-thing/.openspec.yaml',
    'schema: spec-driven\ncreated: 2026-08-01\n',
  );
  write(dir, 'openspec/changes/add-thing/proposal.md', '## Why\nreasons\n');
  write(dir, 'openspec/changes/add-thing/design.md', '## Context\nc\n');
  write(dir, 'openspec/changes/add-thing/tasks.md', '## 1. G\n\n- [x] 1.1 done\n');
  write(
    dir,
    'openspec/changes/add-thing/specs/thing/spec.md',
    '## ADDED Requirements\n\n### Requirement: A\nSHALL a.\n\n#### Scenario: s\n- **WHEN** x\n- **THEN** y\n',
  );

  return dir;
}

describe('archive burst coalescing', () => {
  it('never renders the change in an earlier lane while it is being archived', async () => {
    const packageRoot = findBundledOpenSpecRoot();
    expect(packageRoot).toBeDefined();
    if (packageRoot === undefined) return;

    const dir = buildProject();

    // Everything a subscriber would have rendered, in order.
    const rendered: string[] = [];
    let settled: (() => void) | undefined;

    const handle = watchProject(dir, {
      quietPeriodMs: 300,
      reconcileIntervalMs: 60_000,
      onChange: () => {
        void (async () => {
          const result = await readProject(localFileSource, dir);
          if (!result.ok) return;
          const change = result.snapshot.changes.find((c) => c.name === 'add-thing');
          rendered.push(change === undefined ? 'gone' : change.lane);
          settled?.();
        })();
      },
    });

    // Let the watcher become ready before mutating anything.
    await new Promise((r) => setTimeout(r, 600));

    const finished = new Promise<void>((resolve) => {
      settled = resolve;
    });

    execFileSync(
      process.execPath,
      [join(packageRoot, 'bin', 'openspec.js'), 'archive', 'add-thing', '-y'],
      { cwd: dir, stdio: 'pipe', env: { ...process.env, NO_COLOR: '1' } },
    );

    await Promise.race([finished, new Promise((r) => setTimeout(r, 6000))]);
    // Allow any further coalesced events to arrive before asserting.
    await new Promise((r) => setTimeout(r, 900));
    await handle.close();

    expect(rendered.length).toBeGreaterThan(0);

    // The whole point: the card must never appear in a lane before the one it
    // was in. Seeing "draft" here means a mid-mutation directory was rendered.
    expect(rendered).not.toContain('draft');
    expect(rendered).not.toContain('proposed');
    expect(rendered).not.toContain('specified');
    expect(rendered).not.toContain('ready');

    // And it should end up archived.
    expect(rendered[rendered.length - 1]).toBe('archived');
  }, 30_000);
});
