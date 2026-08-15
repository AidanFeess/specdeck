import { describe, expect, it } from 'vitest';

import { deriveArtifacts, matchesGlob } from './derive.js';
import type { WorkflowSchema } from '../openspec/schema.js';

/**
 * The artifact list the interface reads from is whatever the change's workflow
 * schema declares. A project using a schema specdeck has never seen must get
 * the same treatment as one using `spec-driven`, because specdeck does not own
 * the vocabulary of artifacts and must not behave as though it does.
 */

/** A schema with artifacts specdeck has no special handling for. */
const CUSTOM_SCHEMA: WorkflowSchema = {
  name: 'research-driven',
  version: 1,
  source: 'project',
  path: '/p/openspec/schemas/research-driven.yaml',
  artifacts: [
    { id: 'brief', generates: 'brief.md', description: 'The question', requires: [] },
    {
      id: 'findings',
      generates: 'findings/**/*.md',
      description: 'What was found',
      requires: ['brief'],
    },
    { id: 'writeup', generates: 'writeup.md', description: 'The report', requires: ['findings'] },
  ],
  apply: { requires: ['writeup'], tracks: 'writeup.md' },
};

describe('deriving artifacts from an unfamiliar schema', () => {
  it('reports every declared artifact, not a fixed four', () => {
    const artifacts = deriveArtifacts({
      schema: CUSTOM_SCHEMA,
      presentPaths: ['brief.md'],
      changeRoot: '/p/openspec/changes/study',
    });

    expect(artifacts.map((a) => a.id)).toEqual(['brief', 'findings', 'writeup']);
    // Nothing is dropped for being unrecognized, and nothing named proposal,
    // design, specs, or tasks is invented.
    expect(artifacts.some((a) => a.id === 'proposal')).toBe(false);
  });

  it('marks a declared artifact done once its file exists', () => {
    const artifacts = deriveArtifacts({
      schema: CUSTOM_SCHEMA,
      presentPaths: ['brief.md'],
      changeRoot: '/p/openspec/changes/study',
    });

    const brief = artifacts.find((a) => a.id === 'brief');
    expect(brief?.status).toBe('done');
    expect(brief?.existingPaths).toEqual(['/p/openspec/changes/study/brief.md']);
  });

  it('names what a blocked artifact is waiting on', () => {
    const artifacts = deriveArtifacts({
      schema: CUSTOM_SCHEMA,
      presentPaths: [],
      changeRoot: '/p/openspec/changes/study',
    });

    const findings = artifacts.find((a) => a.id === 'findings');
    expect(findings?.status).toBe('blocked');
    expect(findings?.missingDeps).toEqual(['brief']);
    // A blocked artifact has no files, which is what the reader shows instead
    // of offering something to open.
    expect(findings?.existingPaths).toEqual([]);
  });

  it('collects every file matching a globbed artifact', () => {
    const artifacts = deriveArtifacts({
      schema: CUSTOM_SCHEMA,
      presentPaths: ['brief.md', 'findings/one/notes.md', 'findings/two/notes.md'],
      changeRoot: '/p/openspec/changes/study',
    });

    const findings = artifacts.find((a) => a.id === 'findings');
    expect(findings?.status).toBe('done');
    expect(findings?.existingPaths).toHaveLength(2);
  });
});

describe('matchesGlob', () => {
  it('matches the patterns OpenSpec schemas actually use', () => {
    expect(matchesGlob('proposal.md', 'proposal.md')).toBe(true);
    expect(matchesGlob('specs/**/*.md', 'specs/thing/spec.md')).toBe(true);
    // `**/` may match nothing, so a file directly under specs/ still counts.
    expect(matchesGlob('specs/**/*.md', 'specs/spec.md')).toBe(true);
  });

  it('does not let a single star cross a directory boundary', () => {
    expect(matchesGlob('specs/*.md', 'specs/thing/spec.md')).toBe(false);
    expect(matchesGlob('proposal.md', 'sub/proposal.md')).toBe(false);
  });
});
