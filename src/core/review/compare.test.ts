import { describe, it, expect } from 'vitest';
import { parseCapability } from '../parse/capability.js';
import { parseDeltaSpec } from '../parse/delta.js';
import { compareCapability } from './compare.js';

const requirement = (
  name: string,
  text = 'The system SHALL work.',
  scenarios = '#### Scenario: Allowed\n- **WHEN** ready\n- **THEN** works',
) => `### Requirement: ${name}\n${text}\n${scenarios}\n`;
const current = parseCapability(
  'auth',
  '/spec.md',
  `# Auth\n## Purpose\nAuthentication\n## Requirements\n${requirement('Session')}${requirement('Unchanged')}`,
);

describe('behavior review', () => {
  it('compares changed, added and removed scenarios and keeps untouched requirements', () => {
    const delta = parseDeltaSpec(
      'auth',
      '/delta.md',
      `## MODIFIED Requirements\n${requirement('Session', 'The system SHALL expire.', '#### Scenario: Allowed\n- **WHEN** ready\n- **THEN** expires\n#### Scenario: New\n- **WHEN** new\n- **THEN** works')}`,
    );
    const result = compareCapability(current, delta);
    expect(result.issues).toEqual([]);
    expect(result.comparisons[0]?.scenarios.map((s) => s.status)).toEqual(['modified', 'added']);
    expect(result.preview?.map((r) => r.name)).toEqual(['Session', 'Unchanged']);
    expect(current.requirements[0]?.text).toBe('The system SHALL work.');
  });
  it('applies native renames before modifications using the new name', () => {
    const delta = parseDeltaSpec(
      'auth',
      '/delta.md',
      `## MODIFIED Requirements\n${requirement('Login')}## RENAMED Requirements\n- FROM: \`### Requirement: Session\`\n- TO: \`### Requirement: Login\``,
    );
    const result = compareCapability(current, delta);
    expect(result.issues).toEqual([]);
    expect(result.preview?.map((r) => r.name)).toEqual(['Unchanged', 'Login']);
    expect(result.comparisons[0]?.scenarios[0]?.status).toBe('unchanged');
  });
  it('removes requirements and labels removed scenarios', () => {
    const result = compareCapability(
      current,
      parseDeltaSpec(
        'auth',
        '/delta.md',
        '## REMOVED Requirements\n### Requirement: Session\n**Reason**: Old\n**Migration**: Login',
      ),
    );
    expect(result.preview?.map((r) => r.name)).toEqual(['Unchanged']);
    expect(result.comparisons[0]?.scenarios[0]?.status).toBe('removed');
    expect(
      parseDeltaSpec(
        'auth',
        '/delta.md',
        '## REMOVED Requirements\n### Requirement: Session\n**Reason**: Old\n**Migration**: Login',
      ).issues,
    ).toEqual([]);
  });
  it('creates a new capability from additions', () => {
    const result = compareCapability(
      undefined,
      parseDeltaSpec('new', '/delta.md', `## ADDED Requirements\n${requirement('New')}`),
    );
    expect(result.preview).toHaveLength(1);
    expect(result.comparisons[0]?.before).toBeUndefined();
  });
  it.each([
    `## ADDED Requirements\n${requirement('Session')}`,
    `## MODIFIED Requirements\n${requirement('Missing')}`,
    `## MODIFIED Requirements\n${requirement('Session')}${requirement('Session')}`,
    '## RENAMED Requirements\n- FROM: `### Requirement: Session`',
    '## RENAMED Requirements\n- FROM: `### Requirement: Session`\n- TO: `### Requirement: Unchanged`',
  ])('withholds an invalid or ambiguous preview', (text) => {
    const result = compareCapability(current, parseDeltaSpec('auth', '/delta.md', text));
    expect(result.preview).toBeUndefined();
    expect(result.issues.length).toBeGreaterThan(0);
  });
  it('ignores rename pairs in fenced examples', () => {
    const delta = parseDeltaSpec(
      'auth',
      '/delta.md',
      '## RENAMED Requirements\n```\n- FROM: `### Requirement: Session`\n- TO: `### Requirement: Login`\n```',
    );
    expect(delta.requirements).toEqual([]);
  });
});
