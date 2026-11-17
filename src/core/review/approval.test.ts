import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readProject } from '../read/project.js';
import { localFileSource } from '../fs/node-source.js';
import { reviewApproval } from './approval.js';
import { startServer } from '../../server/server.js';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) {
    const rel = relative(tmpdir(), root);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Unsafe cleanup path');
    rmSync(root, { recursive: true, force: true });
  }
});
function run(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
async function fixture(withGit = true) {
  const root = mkdtempSync(join(tmpdir(), 'specdeck-review-'));
  roots.push(root);
  const dir = join(root, 'openspec/changes/example');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.openspec.yaml'), 'schema: spec-driven\nskip_specs: true\n');
  writeFileSync(join(dir, 'proposal.md'), '# Original\n');
  writeFileSync(join(dir, 'design.md'), '# Removed\n');
  if (withGit) {
    run(root, ['init']);
    run(root, ['config', 'user.name', 'Reviewer']);
    run(root, ['config', 'user.email', 'review@example.test']);
    run(root, ['config', 'core.autocrlf', 'false']);
    run(root, ['add', '.']);
    run(root, ['commit', '-m', 'initial']);
  }
  const project = await readProject(localFileSource, root);
  if (!project.ok || !project.snapshot.changes[0]) throw new Error('Fixture could not be read');
  return { root, dir, change: project.snapshot.changes[0] };
}

describe('approval review', () => {
  it('compares modified, new, and removed artifacts without changing index or working tree', async () => {
    const { root, dir, change } = await fixture();
    run(root, [
      'commit',
      '--allow-empty',
      '-m',
      'approve\n\nApproved-change: example\nApproved-by: Reviewer <review@example.test>',
    ]);
    writeFileSync(join(dir, 'proposal.md'), '# Revised\n');
    writeFileSync(join(dir, 'tasks.md'), '- [ ] New\n');
    unlinkSync(join(dir, 'design.md'));
    const before = run(root, ['status', '--porcelain']);
    const review = await reviewApproval(root, change);
    expect(review.status).toBe('available');
    expect(review.artifacts.map((a) => [a.path, a.status])).toEqual([
      ['design.md', 'removed'],
      ['proposal.md', 'modified'],
      ['tasks.md', 'added'],
    ]);
    expect(review.artifacts[1]?.before).toBe('# Original\n');
    expect(run(root, ['status', '--porcelain'])).toBe(before);
  });
  it('distinguishes missing git from no approval', async () => {
    const git = await fixture();
    expect((await reviewApproval(git.root, git.change)).status).toBe('never-approved');
    const plain = await fixture(false);
    expect((await reviewApproval(plain.root, plain.change)).status).toBe('unavailable');
    expect((await reviewApproval(git.root, { ...git.change, location: 'archived' })).status).toBe(
      'unavailable',
    );
  });
  it('serves review only for a change in the open project', async () => {
    const { root } = await fixture(false);
    const server = await startServer({ initialProject: root, port: 0 });
    try {
      const response = await fetch(`${server.url}/api/review?change=example`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        approval: { status: string };
        capabilities: unknown[];
      };
      expect(body.approval.status).toBe('unavailable');
      expect(body.capabilities).toEqual([]);
      expect((await fetch(`${server.url}/api/review?change=../../other`)).status).toBe(404);
    } finally {
      await server.close();
    }
  });
});
