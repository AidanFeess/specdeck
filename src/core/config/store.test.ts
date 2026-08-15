import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  addProject,
  readConfig,
  removeProject,
  setProjectOrder,
  setProjectStarred,
} from './store.js';

/**
 * The registry is a file users already have. Adding fields to it must not
 * disturb an existing one, and a file written by a newer specdeck must still
 * load here rather than failing.
 */

let dir: string;
let previous: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'specdeck-config-'));
  previous = process.env.SPECDECK_CONFIG_DIR;
  process.env.SPECDECK_CONFIG_DIR = dir;
});

afterEach(() => {
  if (previous === undefined) delete process.env.SPECDECK_CONFIG_DIR;
  else process.env.SPECDECK_CONFIG_DIR = previous;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows can hold a handle briefly.
  }
});

function write(config: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
}

const configPath = (): string => join(dir, 'config.json');

describe('reading a configuration written by an earlier version', () => {
  it('loads projects with no star and no order', async () => {
    write({
      version: 1,
      defaults: { handoffMethod: 'auto' },
      projects: [{ path: '/a' }, { path: '/b' }],
    });

    const config = await readConfig();
    expect(config.projects.map((p) => p.path)).toEqual(['/a', '/b']);
    expect(config.projects[0]?.starred).toBeUndefined();
    expect(config.projects[0]?.order).toBeUndefined();
  });

  it('does not rewrite the file just because it was read', async () => {
    write({ version: 1, defaults: { handoffMethod: 'auto' }, projects: [{ path: '/a' }] });
    const before = statSync(configPath()).mtimeMs;

    await readConfig();
    await readConfig();

    expect(statSync(configPath()).mtimeMs).toBe(before);
  });
});

describe('reading a configuration written by a newer version', () => {
  it('ignores fields it does not recognise rather than failing', async () => {
    write({
      version: 1,
      defaults: { handoffMethod: 'auto', somethingNew: true },
      projects: [{ path: '/a', starred: true, order: 3, futureField: { nested: 'value' } }],
      topLevelUnknown: [1, 2, 3],
    });

    const config = await readConfig();
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0]?.starred).toBe(true);
    expect(config.projects[0]?.order).toBe(3);
    // The unknown key is dropped rather than carried through.
    expect('futureField' in (config.projects[0] ?? {})).toBe(false);
  });

  it('falls back to defaults for a corrupt file rather than refusing to start', async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(configPath(), '{ not json at all', 'utf8');

    const config = await readConfig();
    expect(config.projects).toEqual([]);
    expect(config.defaults.handoffMethod).toBe('auto');
  });
});

describe('starring', () => {
  it('sets and clears the flag', async () => {
    write({ version: 1, defaults: { handoffMethod: 'auto' }, projects: [{ path: '/a' }] });

    await setProjectStarred('/a', true);
    expect((await readConfig()).projects[0]?.starred).toBe(true);

    await setProjectStarred('/a', false);
    // Cleared rather than stored as false, so an unstarred project looks exactly
    // like one that was never starred.
    expect((await readConfig()).projects[0]?.starred).toBeUndefined();
  });

  it('registers a project that was not in the file yet', async () => {
    write({ version: 1, defaults: { handoffMethod: 'auto' }, projects: [] });
    await setProjectStarred('/new', true);
    const config = await readConfig();
    expect(config.projects.map((p) => p.path)).toEqual(['/new']);
    expect(config.projects[0]?.starred).toBe(true);
  });
});

describe('ordering', () => {
  it('records an explicit position for each named path', async () => {
    write({
      version: 1,
      defaults: { handoffMethod: 'auto' },
      projects: [{ path: '/a' }, { path: '/b' }, { path: '/c' }],
    });

    await setProjectOrder(['/c', '/a', '/b']);
    const config = await readConfig();
    const orderOf = (path: string): number | undefined =>
      config.projects.find((p) => p.path === path)?.order;

    expect(orderOf('/c')).toBe(0);
    expect(orderOf('/a')).toBe(1);
    expect(orderOf('/b')).toBe(2);
  });

  it('leaves projects it was not told about alone', async () => {
    // Reordering a filtered subset must not discard the placement of the
    // projects that were hidden at the time.
    write({
      version: 1,
      defaults: { handoffMethod: 'auto' },
      projects: [{ path: '/a', order: 7 }, { path: '/b' }, { path: '/c' }],
    });

    await setProjectOrder(['/c', '/b']);
    const config = await readConfig();
    expect(config.projects.find((p) => p.path === '/a')?.order).toBe(7);
  });

  it('does not disturb an unrelated setting', async () => {
    write({
      version: 1,
      defaults: { handoffMethod: 'auto' },
      projects: [{ path: '/a', handoffMethod: 'clipboard' }],
    });

    await setProjectOrder(['/a']);
    const stored = JSON.parse(readFileSync(configPath(), 'utf8')) as {
      projects: Array<{ handoffMethod?: string }>;
    };
    expect(stored.projects[0]?.handoffMethod).toBe('clipboard');
  });
});

/**
 * One folder can reach the registry spelled several ways. The picker resolves,
 * a hand-edited file may not, and the client sends back what the server gave
 * it. Comparing the raw strings made every update append a second entry for a
 * project that was already there, and the projects view then listed it twice.
 */
describe('one folder spelled several ways', () => {
  const home = (): string => join(dir, 'projects', 'work');
  const variants = (): string[] => [
    home() + sep,
    join(dir, 'projects', '.', 'work'),
    join(dir, 'projects', 'other', '..', 'work'),
  ];

  function paths(config: { projects: Array<{ path: string }> }): string[] {
    return config.projects.map((p) => p.path);
  }

  it('adds a project only once', async () => {
    write({ version: 1, defaults: { handoffMethod: 'auto' }, projects: [{ path: home() }] });
    for (const variant of variants()) await addProject(variant);
    expect(paths(await readConfig())).toEqual([home()]);
  });

  it('orders the entry that is already there instead of appending another', async () => {
    write({ version: 1, defaults: { handoffMethod: 'auto' }, projects: [{ path: home() }] });

    for (const variant of variants()) await setProjectOrder([variant]);

    const config = await readConfig();
    expect(paths(config)).toEqual([home()]);
    expect(config.projects[0]?.order).toBe(0);
  });

  it('stars the entry that is already there', async () => {
    write({ version: 1, defaults: { handoffMethod: 'auto' }, projects: [{ path: home() }] });
    await setProjectStarred(variants()[0] ?? home(), true);

    const config = await readConfig();
    expect(paths(config)).toEqual([home()]);
    expect(config.projects[0]?.starred).toBe(true);
  });

  it('removes the entry however it is spelled', async () => {
    write({ version: 1, defaults: { handoffMethod: 'auto' }, projects: [{ path: home() }] });
    await removeProject(variants()[0] ?? home());
    expect(paths(await readConfig())).toEqual([]);
  });

  it('leaves the stored spelling exactly as it was written', async () => {
    // Only the comparison is normalized. Rewriting the path the user or an
    // older version wrote would be a change they did not ask for.
    const original = home().split(sep).join('/');
    write({ version: 1, defaults: { handoffMethod: 'auto' }, projects: [{ path: original }] });

    await setProjectStarred(home(), true);
    expect(paths(await readConfig())).toEqual([original]);
  });

  it.skipIf(process.platform !== 'win32')(
    'treats slash direction and drive letter case as the same folder on Windows',
    async () => {
      const forward = home().split(sep).join('/');
      write({ version: 1, defaults: { handoffMethod: 'auto' }, projects: [{ path: forward }] });

      await setProjectOrder([home()]);
      await setProjectStarred(home().charAt(0).toLowerCase() + home().slice(1), true);

      const config = await readConfig();
      expect(paths(config)).toEqual([forward]);
      expect(config.projects[0]?.order).toBe(0);
      expect(config.projects[0]?.starred).toBe(true);
    },
  );
});
