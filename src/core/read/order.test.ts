import { describe, expect, it } from 'vitest';

import { orderProjects, isProjectSort, type ProjectPlacement } from './order.js';
import type { ProjectOverview } from './overview.js';

function project(name: string, extra: Partial<ProjectOverview> = {}): ProjectOverview {
  return {
    path: `/p/${name}`,
    name,
    ok: true,
    changes: 0,
    capabilities: 0,
    lanes: {},
    tasksCompleted: 0,
    tasksTotal: 0,
    dirty: 0,
    unpushed: 0,
    incoming: 0,
    syncAvailable: false,
    ...extra,
  };
}

function placements(entries: ProjectPlacement[]): Map<string, ProjectPlacement> {
  return new Map(entries.map((entry) => [entry.path, entry]));
}

const names = (list: ProjectOverview[]): string[] => list.map((p) => p.name);

describe('orderProjects', () => {
  it('keeps the file order when nothing has been arranged', () => {
    // An existing configuration must open looking exactly as it did before this
    // feature existed.
    const list = [project('charlie'), project('alpha'), project('bravo')];
    expect(names(orderProjects(list, placements([]), 'manual'))).toEqual([
      'charlie',
      'alpha',
      'bravo',
    ]);
  });

  it('applies an explicit arrangement', () => {
    const list = [project('a'), project('b'), project('c')];
    const placed = placements([
      { path: '/p/c', order: 0 },
      { path: '/p/a', order: 1 },
      { path: '/p/b', order: 2 },
    ]);
    expect(names(orderProjects(list, placed, 'manual'))).toEqual(['c', 'a', 'b']);
  });

  it('puts unplaced projects after placed ones, in their existing sequence', () => {
    const list = [project('x'), project('y'), project('z')];
    const placed = placements([{ path: '/p/z', order: 0 }]);
    expect(names(orderProjects(list, placed, 'manual'))).toEqual(['z', 'x', 'y']);
  });

  it('puts starred projects on top', () => {
    const list = [project('a'), project('b'), project('c')];
    const placed = placements([{ path: '/p/c', starred: true }]);
    expect(names(orderProjects(list, placed, 'manual'))[0]).toBe('c');
  });

  it('never reorders the starred group when a sort is applied', () => {
    // The whole point of starring: the user has already said what order these
    // should be in, so a sort must not touch them.
    const list = [project('zulu'), project('alpha'), project('mike')];
    const placed = placements([
      { path: '/p/zulu', starred: true, order: 0 },
      { path: '/p/mike', starred: true, order: 1 },
    ]);

    for (const sort of ['name', 'activity', 'tasks'] as const) {
      const ordered = names(orderProjects(list, placed, sort));
      expect(ordered.slice(0, 2), `sort=${sort}`).toEqual(['zulu', 'mike']);
    }
  });

  it('sorts the unstarred remainder by name', () => {
    const list = [project('delta'), project('alpha'), project('charlie')];
    const placed = placements([{ path: '/p/delta', starred: true }]);
    expect(names(orderProjects(list, placed, 'name'))).toEqual(['delta', 'alpha', 'charlie']);
  });

  it('sorts by most recent activity first', () => {
    const list = [
      project('old', { lastActivity: '2026-01-01T00:00:00Z' }),
      project('new', { lastActivity: '2026-08-01T00:00:00Z' }),
      project('middle', { lastActivity: '2026-04-01T00:00:00Z' }),
    ];
    expect(names(orderProjects(list, placements([]), 'activity'))).toEqual([
      'new',
      'middle',
      'old',
    ]);
  });

  it('sorts projects with no known activity last, not first', () => {
    // An absent date is not an ancient one. Treating it as zero would bury
    // active projects under ones git knows nothing about.
    const list = [project('unknown'), project('recent', { lastActivity: '2026-08-01T00:00:00Z' })];
    expect(names(orderProjects(list, placements([]), 'activity'))).toEqual(['recent', 'unknown']);
  });

  it('sorts by outstanding tasks, most remaining first', () => {
    const list = [
      project('nearly', { tasksCompleted: 9, tasksTotal: 10 }),
      project('barely', { tasksCompleted: 1, tasksTotal: 10 }),
      project('done', { tasksCompleted: 5, tasksTotal: 5 }),
    ];
    expect(names(orderProjects(list, placements([]), 'tasks'))).toEqual([
      'barely',
      'nearly',
      'done',
    ]);
  });

  it('breaks ties by name so the order is stable rather than arbitrary', () => {
    const list = [project('beta'), project('alpha')];
    expect(names(orderProjects(list, placements([]), 'tasks'))).toEqual(['alpha', 'beta']);
  });

  it('does not lose or duplicate a project under any sort', () => {
    const list = [project('a'), project('b'), project('c'), project('d')];
    const placed = placements([
      { path: '/p/b', starred: true },
      { path: '/p/d', order: 0 },
    ]);
    for (const sort of ['manual', 'name', 'activity', 'tasks'] as const) {
      const ordered = names(orderProjects(list, placed, sort));
      expect(ordered.slice().sort(), `sort=${sort}`).toEqual(['a', 'b', 'c', 'd']);
    }
  });
});

describe('isProjectSort', () => {
  it('accepts the known sorts and rejects anything else', () => {
    for (const sort of ['manual', 'name', 'activity', 'tasks']) {
      expect(isProjectSort(sort)).toBe(true);
    }
    expect(isProjectSort('size')).toBe(false);
    expect(isProjectSort(undefined)).toBe(false);
  });
});
