import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addProject, configPath, readConfig, removeProject, rootKind } from './store.js';

/**
 * The registry gained a kind when OpenSpec grew workspaces and context stores.
 * Every entry written before that has none, and losing one of those would mean
 * a root silently disappearing from somebody's dashboard.
 */

const roots: string[] = [];
let previous: string | undefined;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'specdeck-config-'));
  roots.push(dir);
  previous = process.env.SPECDECK_CONFIG_DIR;
  process.env.SPECDECK_CONFIG_DIR = dir;
});

afterEach(() => {
  if (previous === undefined) delete process.env.SPECDECK_CONFIG_DIR;
  else process.env.SPECDECK_CONFIG_DIR = previous;
});

afterAll(() => {
  for (const dir of roots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can briefly hold a handle open.
    }
  }
});

describe('a registry written before roots had kinds', () => {
  it('loads with every entry intact, resolving each as a plain project', async () => {
    writeFileSync(
      configPath(),
      JSON.stringify({
        version: 1,
        defaults: { handoffMethod: 'auto' },
        projects: [
          { path: '/a' },
          { path: '/b', name: 'Bee' },
          { path: '/c', handoffMethod: 'terminal' },
        ],
      }),
      'utf8',
    );

    const config = await readConfig();

    expect(config.projects.map((p) => p.path)).toEqual(['/a', '/b', '/c']);
    expect(config.projects.every((p) => rootKind(p) === 'project')).toBe(true);
    // The fields that already existed keep working.
    expect(config.projects[1]?.name).toBe('Bee');
    expect(config.projects[2]?.handoffMethod).toBe('terminal');
  });

  it('keeps an entry whose kind this version does not recognize', async () => {
    writeFileSync(
      configPath(),
      JSON.stringify({
        version: 1,
        defaults: {},
        projects: [{ path: '/a', kind: 'something-newer' }],
      }),
      'utf8',
    );

    const config = await readConfig();

    // Dropping it would lose a root the user registered, which is worse than
    // showing it as a project.
    expect(config.projects).toHaveLength(1);
    expect(rootKind(config.projects[0]!)).toBe('project');
  });
});

describe('registering roots', () => {
  it('records the kind of a workspace root', async () => {
    await addProject('/ws', 'workspace');
    const config = await readConfig();

    expect(rootKind(config.projects[0]!)).toBe('workspace');
  });

  it('leaves a plain project entry free of a redundant kind', async () => {
    await addProject('/p');

    // Not written when it is the default, so an existing registry does not
    // churn the moment this version touches it.
    expect(readFileSync(configPath(), 'utf8')).not.toContain('"kind"');
  });

  it('removing a root only forgets it here', async () => {
    await addProject('/ws', 'workspace');
    await removeProject('/ws');

    const config = await readConfig();
    expect(config.projects).toHaveLength(0);
    // Nothing in this module can reach OpenSpec's own registry, which is the
    // point: forgetting a workspace in specdeck must never unregister it.
  });
});
