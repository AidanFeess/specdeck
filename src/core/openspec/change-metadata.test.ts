import { describe, expect, it } from 'vitest';

import { parseChangeMetadata } from './change-metadata.js';
import { parseArchivedDirName } from './paths.js';

const PATH = '/repo/openspec/changes/add-auth/.openspec.yaml';

describe('parseChangeMetadata', () => {
  it('reads what "openspec new change" actually writes', () => {
    const { metadata, issues } = parseChangeMetadata(
      'schema: spec-driven\ncreated: 2026-08-14\n',
      PATH,
      'spec-driven',
    );
    expect(metadata.schema).toBe('spec-driven');
    expect(metadata.created).toBe('2026-08-14');
    expect(issues).toEqual([]);
  });

  it('keeps an unquoted date as a plain date rather than a timestamp', () => {
    // YAML resolves an unquoted 2026-08-14 to a Date. OpenSpec records a date,
    // not a time, so widening it would make the timeline claim precision it
    // does not have.
    const { metadata } = parseChangeMetadata('schema: spec-driven\ncreated: 2026-08-14\n', PATH, 'x');
    expect(metadata.created).toBe('2026-08-14');
  });

  it('accepts a quoted date identically', () => {
    const { metadata } = parseChangeMetadata(
      "schema: spec-driven\ncreated: '2026-08-14'\n",
      PATH,
      'x',
    );
    expect(metadata.created).toBe('2026-08-14');
  });

  it('reads the optional workspace fields', () => {
    const { metadata } = parseChangeMetadata(
      [
        'schema: workspace-planning',
        'goal: ship the thing',
        'affected_areas:',
        '  - api',
        '  - web',
        'initiative:',
        '  store: main',
        '  id: init-1',
      ].join('\n'),
      PATH,
      'spec-driven',
    );
    expect(metadata.schema).toBe('workspace-planning');
    expect(metadata.goal).toBe('ship the thing');
    expect(metadata.affectedAreas).toEqual(['api', 'web']);
    expect(metadata.initiative).toEqual({ store: 'main', id: 'init-1' });
  });

  it('warns but still reads a change with no metadata file', () => {
    // A hand-made change directory is still real work. Hiding it would be worse
    // than showing it with an assumed schema.
    const { metadata, issues } = parseChangeMetadata(undefined, PATH, 'spec-driven');
    expect(metadata.schema).toBe('spec-driven');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
  });

  it('reports malformed YAML as an error without throwing', () => {
    const { metadata, issues } = parseChangeMetadata('schema: [unclosed\n', PATH, 'spec-driven');
    expect(metadata.schema).toBe('spec-driven');
    expect(issues[0]?.severity).toBe('error');
  });

  it('reports a YAML document that is not a mapping', () => {
    const { issues } = parseChangeMetadata('- just\n- a list\n', PATH, 'spec-driven');
    expect(issues[0]?.severity).toBe('error');
  });

  it('warns when no schema is named', () => {
    const { metadata, issues } = parseChangeMetadata('created: 2026-08-14\n', PATH, 'spec-driven');
    expect(metadata.schema).toBe('spec-driven');
    expect(issues.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('ignores an initiative link that is missing a field', () => {
    const { metadata, issues } = parseChangeMetadata(
      'schema: spec-driven\ninitiative:\n  store: main\n',
      PATH,
      'spec-driven',
    );
    expect(metadata.initiative).toBeUndefined();
    expect(issues.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('omits absent optional fields rather than setting them undefined', () => {
    const { metadata } = parseChangeMetadata('schema: spec-driven\n', PATH, 'spec-driven');
    expect('created' in metadata).toBe(false);
    expect('goal' in metadata).toBe(false);
  });
});

describe('parseArchivedDirName', () => {
  it('splits the date prefix OpenSpec adds when archiving', () => {
    expect(parseArchivedDirName('2026-08-14-add-user-auth')).toEqual({
      name: 'add-user-auth',
      archivedOn: '2026-08-14',
    });
  });

  it('keeps a hyphenated change name intact', () => {
    expect(parseArchivedDirName('2026-01-02-add-a-b-c')).toEqual({
      name: 'add-a-b-c',
      archivedOn: '2026-01-02',
    });
  });

  it('leaves an unrecognized directory name alone', () => {
    // More likely hand-made than corrupt, so it keeps its whole name.
    expect(parseArchivedDirName('legacy-change')).toEqual({ name: 'legacy-change' });
  });

  it('does not treat a partial date as a prefix', () => {
    expect(parseArchivedDirName('2026-08-add-auth')).toEqual({ name: '2026-08-add-auth' });
  });
});
