// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { applyFilters, applySort, facets, isFiltered, loadPreferences, UNLINKED } from './list.js';

/**
 * Sorting a list where some rows have no value for the column is the case that
 * quietly goes wrong: a missing date treated as the epoch, or missing progress
 * treated as zero, ranks "we do not know" alongside "it is genuinely zero" and
 * puts the unknowns confidently at one end.
 */

function change(over) {
  return Object.assign(
    {
      name: 'a-change',
      lane: 'in-progress',
      archived: false,
      tasksCompleted: 0,
      tasksTotal: 0,
      rootPath: '/p',
      rootName: 'p',
      issues: 0,
    },
    over,
  );
}

const prefs = (over) => Object.assign(loadPreferences(), over);

beforeEach(() => {
  localStorage.clear();
});

describe('sorting with missing values', () => {
  it('keeps rows with no date together at the end, ascending', () => {
    const rows = applySort(
      [
        change({ name: 'no-date' }),
        change({ name: 'older', created: '2026-01-01' }),
        change({ name: 'newer', created: '2026-06-01' }),
      ],
      prefs({ sort: 'created', direction: 'asc' }),
    );

    expect(rows.map((r) => r.name)).toEqual(['older', 'newer', 'no-date']);
  });

  it('keeps them at the end descending too, rather than flipping to the top', () => {
    const rows = applySort(
      [
        change({ name: 'no-date' }),
        change({ name: 'older', created: '2026-01-01' }),
        change({ name: 'newer', created: '2026-06-01' }),
      ],
      prefs({ sort: 'created', direction: 'desc' }),
    );

    // 'no-date' must not read as the most recent change.
    expect(rows.map((r) => r.name)).toEqual(['newer', 'older', 'no-date']);
  });

  it('does not treat a change with no tasks as zero progress', () => {
    const rows = applySort(
      [
        change({ name: 'none', tasksTotal: 0 }),
        change({ name: 'started', tasksCompleted: 1, tasksTotal: 4 }),
      ],
      prefs({ sort: 'progress', direction: 'asc' }),
    );

    // A change with no task list is not "0% done"; it is unknown.
    expect(rows.map((r) => r.name)).toEqual(['started', 'none']);
  });

  it('does not rank an unknown approval', () => {
    const rows = applySort(
      [
        change({ name: 'unknown', approval: { state: 'unknown' } }),
        change({ name: 'approved', approval: { state: 'approved' } }),
        change({ name: 'stale', approval: { state: 'needs-review' } }),
      ],
      prefs({ sort: 'approval', direction: 'asc' }),
    );

    expect(rows.map((r) => r.name)).toEqual(['stale', 'approved', 'unknown']);
  });
});

describe('filtering', () => {
  it('hides archived changes unless asked for', () => {
    const rows = [change({ name: 'live' }), change({ name: 'old', archived: true })];

    expect(applyFilters(rows, prefs({})).map((r) => r.name)).toEqual(['live']);
    expect(applyFilters(rows, prefs({ archived: true })).map((r) => r.name)).toEqual([
      'live',
      'old',
    ]);
  });

  it('applies several filters together', () => {
    const rows = [
      change({ name: 'a', lane: 'done', rootPath: '/one' }),
      change({ name: 'b', lane: 'done', rootPath: '/two' }),
      change({ name: 'c', lane: 'draft', rootPath: '/one' }),
    ];

    const filtered = applyFilters(rows, prefs({ lanes: ['done'], roots: ['/one'] }));
    expect(filtered.map((r) => r.name)).toEqual(['a']);
  });

  it('matches unlinked changes only when unlinked is chosen', () => {
    const rows = [change({ name: 'linked', initiative: 'i1' }), change({ name: 'loose' })];

    expect(applyFilters(rows, prefs({ initiatives: ['i1'] })).map((r) => r.name)).toEqual([
      'linked',
    ]);
    expect(applyFilters(rows, prefs({ initiatives: [UNLINKED] })).map((r) => r.name)).toEqual([
      'loose',
    ]);
  });

  it('excludes changes with no creation date from a date range', () => {
    const rows = [change({ name: 'dated', created: '2026-03-01' }), change({ name: 'undated' })];

    // A change with no date cannot be said to fall inside a range.
    const filtered = applyFilters(rows, prefs({ from: '2026-01-01' }));
    expect(filtered.map((r) => r.name)).toEqual(['dated']);
  });

  it('includes a change created on the last day of the range', () => {
    const rows = [change({ name: 'edge', created: '2026-03-31T18:00:00.000Z' })];
    expect(applyFilters(rows, prefs({ to: '2026-03-31' }))).toHaveLength(1);
  });

  it('knows when nothing is narrowing the list', () => {
    expect(isFiltered(prefs({}))).toBe(false);
    expect(isFiltered(prefs({ lanes: ['done'] }))).toBe(true);
  });
});

describe('facets', () => {
  it('offers only the values present, in lane order', () => {
    const f = facets([
      change({ lane: 'done', rootPath: '/one', rootName: 'one' }),
      change({ lane: 'draft', rootPath: '/two', rootName: 'two', initiative: 'i1' }),
    ]);

    expect(f.lanes).toEqual(['draft', 'done']);
    expect(f.roots.map((r) => r.name).sort()).toEqual(['one', 'two']);
    expect(f.initiatives).toEqual(['i1']);
    expect(f.hasUnlinked).toBe(true);
  });
});
