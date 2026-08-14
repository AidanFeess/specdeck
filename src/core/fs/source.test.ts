import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryFileSource } from './memory-source.js';
import { NodeFileSource } from './node-source.js';
import { exists, isDirectory, walkFiles, type FileSource } from './source.js';

/**
 * The same behavioral suite is run against both sources.
 *
 * If the local and in-memory implementations ever diverge, parser tests written
 * against memory stop predicting real behavior, which would make the whole seam
 * worse than useless.
 */

let tempRoot: string;

const TREE = {
  'openspec/specs/user-auth/spec.md': '# user-auth Specification\n',
  'openspec/specs/session store/spec.md': '# spaced directory\n',
  'openspec/changes/add-auth/proposal.md': '## Why\n',
  'openspec/changes/add-auth/tasks.md': '- [ ] 1.1 do the thing\n',
  'openspec/changes/add-auth/specs/user-auth/spec.md': '## ADDED Requirements\n',
  'openspec/changes/archive/2026-08-14-old/proposal.md': '## Why\n',
  'openspec/naïve-café.md': 'non-ascii name\n',
  'node_modules/junk/index.js': 'should never be walked\n',
};

beforeAll(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'specdeck-fs-'));
  for (const [relative, content] of Object.entries(TREE)) {
    const absolute = join(tempRoot, relative);
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, content, 'utf8');
  }
});

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

function memorySource(): FileSource {
  const files: Record<string, string> = {};
  for (const [relative, content] of Object.entries(TREE)) {
    files[`/root/${relative}`] = content;
  }
  return new MemoryFileSource(files);
}

describe.each([
  ['NodeFileSource', () => new NodeFileSource(), () => tempRoot],
  ['MemoryFileSource', memorySource, () => '/root'],
])('%s', (_name, makeSource, getRoot) => {
  it('reads a file that exists', async () => {
    const source = makeSource();
    const text = await source.readText(`${getRoot()}/openspec/changes/add-auth/proposal.md`);
    expect(text).toBe('## Why\n');
  });

  it('resolves to undefined for a file that does not exist', async () => {
    const source = makeSource();
    expect(
      await source.readText(`${getRoot()}/openspec/changes/add-auth/design.md`),
    ).toBeUndefined();
  });

  it('lists a directory', async () => {
    const source = makeSource();
    const entries = await source.list(`${getRoot()}/openspec/changes/add-auth`);
    expect(entries?.map((e) => e.name).sort()).toEqual(['proposal.md', 'specs', 'tasks.md']);
    expect(entries?.find((e) => e.name === 'specs')?.kind).toBe('directory');
    expect(entries?.find((e) => e.name === 'tasks.md')?.kind).toBe('file');
  });

  it('resolves to undefined when listing a directory that does not exist', async () => {
    const source = makeSource();
    expect(await source.list(`${getRoot()}/openspec/changes/nope`)).toBeUndefined();
  });

  it('resolves to undefined when listing something that is a file', async () => {
    const source = makeSource();
    expect(await source.list(`${getRoot()}/openspec/changes/add-auth/tasks.md`)).toBeUndefined();
  });

  it('stats a file', async () => {
    const source = makeSource();
    const stat = await source.stat(`${getRoot()}/openspec/changes/add-auth/proposal.md`);
    expect(stat?.size).toBeGreaterThan(0);
  });

  it('reports existence', async () => {
    const source = makeSource();
    const root = getRoot();
    expect(await exists(source, `${root}/openspec/changes/add-auth/proposal.md`)).toBe(true);
    expect(await exists(source, `${root}/openspec/changes/add-auth/design.md`)).toBe(false);
    expect(await isDirectory(source, `${root}/openspec/changes/add-auth`)).toBe(true);
    expect(await isDirectory(source, `${root}/openspec/changes/add-auth/tasks.md`)).toBe(false);
  });

  it('walks a tree and reports forward-slash relative paths', async () => {
    const source = makeSource();
    const walked = await walkFiles(source, `${getRoot()}/openspec`);
    const relatives = walked.map((w) => w.relativePath);

    expect(relatives).toContain('changes/add-auth/specs/user-auth/spec.md');
    expect(relatives).toContain('specs/user-auth/spec.md');
    // Relative paths must never carry a backslash, so callers can pattern match
    // without branching on platform.
    expect(relatives.every((r) => !r.includes('\\'))).toBe(true);
  });

  it('handles directory names with spaces and non-ascii characters', async () => {
    const source = makeSource();
    const walked = await walkFiles(source, `${getRoot()}/openspec`);
    const relatives = walked.map((w) => w.relativePath);
    expect(relatives).toContain('specs/session store/spec.md');
    expect(relatives).toContain('naïve-café.md');
  });

  it('honors a directory filter, so a walk cannot wander into node_modules', async () => {
    const source = makeSource();
    const walked = await walkFiles(source, getRoot(), {
      includeDirectory: (relative) => !relative.startsWith('node_modules'),
    });
    expect(walked.some((w) => w.relativePath.includes('node_modules'))).toBe(false);
    expect(walked.some((w) => w.relativePath.startsWith('openspec/'))).toBe(true);
  });

  it('honors a file filter', async () => {
    const source = makeSource();
    const walked = await walkFiles(source, `${getRoot()}/openspec`, {
      includeFile: (relative) => relative.endsWith('tasks.md'),
    });
    expect(walked).toHaveLength(1);
    expect(walked[0]?.relativePath).toBe('changes/add-auth/tasks.md');
  });

  it('stops descending at the depth limit', async () => {
    const source = makeSource();
    const shallow = await walkFiles(source, `${getRoot()}/openspec`, { maxDepth: 1 });
    // Depth 1 reaches openspec/<dir>/<file> but not openspec/<dir>/<dir>/<file>.
    expect(shallow.map((w) => w.relativePath)).toEqual(['naïve-café.md']);
  });

  it('returns an empty list when walking a root that does not exist', async () => {
    const source = makeSource();
    expect(await walkFiles(source, `${getRoot()}/nowhere`)).toEqual([]);
  });
});
