import { describe, expect, it } from 'vitest';

import { MemoryFileSource } from '../fs/memory-source.js';
import { NodeFileSource } from '../fs/node-source.js';
import { describeSchemaFailure, loadSchema, trackedArtifact } from './schema.js';
import { schemaSearchPaths } from './paths.js';

const SPEC_DRIVEN = `
name: spec-driven
version: 1
description: Default OpenSpec workflow
artifacts:
  - id: proposal
    generates: proposal.md
    description: Initial proposal
    template: proposal.md
    requires: []
  - id: specs
    generates: "specs/**/*.md"
    description: Detailed specifications
    template: spec.md
    requires:
      - proposal
  - id: design
    generates: design.md
    description: Technical design
    template: design.md
    requires:
      - proposal
  - id: tasks
    generates: tasks.md
    description: Implementation checklist
    template: tasks.md
    requires:
      - specs
      - design
apply:
  requires: [tasks]
  tracks: tasks.md
`;

function sourceWith(files: Record<string, string>): MemoryFileSource {
  return new MemoryFileSource(files);
}

describe('loadSchema', () => {
  it('loads artifacts and their dependencies', async () => {
    const source = sourceWith({ '/pkg/schemas/spec-driven/schema.yaml': SPEC_DRIVEN });
    const result = await loadSchema(source, 'spec-driven', { packageSchemasDir: '/pkg/schemas' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.schema.name).toBe('spec-driven');
    expect(result.schema.artifacts.map((a) => a.id)).toEqual([
      'proposal',
      'specs',
      'design',
      'tasks',
    ]);
    expect(result.schema.artifacts.find((a) => a.id === 'tasks')?.requires).toEqual([
      'specs',
      'design',
    ]);
    expect(result.schema.artifacts.find((a) => a.id === 'specs')?.generates).toBe('specs/**/*.md');
    expect(result.schema.source).toBe('package');
  });

  it('prefers a project-local schema over the packaged one', async () => {
    // A project can override a built-in schema name. specdeck must resolve the
    // same definition the CLI would, or the board would show artifacts the
    // change does not actually use.
    const source = sourceWith({
      '/repo/openspec/schemas/spec-driven/schema.yaml': SPEC_DRIVEN.replace(
        'version: 1',
        'version: 9',
      ),
      '/pkg/schemas/spec-driven/schema.yaml': SPEC_DRIVEN,
    });
    const result = await loadSchema(source, 'spec-driven', {
      projectSchemasDir: '/repo/openspec/schemas',
      packageSchemasDir: '/pkg/schemas',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schema.version).toBe(9);
    expect(result.schema.source).toBe('project');
  });

  it('prefers a user override over the packaged one', async () => {
    const source = sourceWith({
      '/data/schemas/custom/schema.yaml': SPEC_DRIVEN.replace('name: spec-driven', 'name: custom'),
      '/pkg/schemas/custom/schema.yaml': SPEC_DRIVEN.replace('name: spec-driven', 'name: other'),
    });
    const result = await loadSchema(source, 'custom', {
      userSchemasDir: '/data/schemas',
      packageSchemasDir: '/pkg/schemas',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schema.source).toBe('user');
    expect(result.schema.name).toBe('custom');
  });

  it('reports every location it searched when nothing is found', async () => {
    const source = sourceWith({});
    const result = await loadSchema(source, 'missing', {
      projectSchemasDir: '/repo/openspec/schemas',
      packageSchemasDir: '/pkg/schemas',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('not-found');
    const described = describeSchemaFailure('missing', result.failure);
    expect(described).toContain('/repo/openspec/schemas/missing/schema.yaml');
    expect(described).toContain('/pkg/schemas/missing/schema.yaml');
  });

  it('reports invalid YAML rather than throwing', async () => {
    const source = sourceWith({ '/pkg/schemas/broken/schema.yaml': 'artifacts: [unclosed\n' });
    const result = await loadSchema(source, 'broken', { packageSchemasDir: '/pkg/schemas' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('invalid');
  });

  it('rejects a schema with no artifacts list', async () => {
    const source = sourceWith({ '/pkg/schemas/thin/schema.yaml': 'name: thin\nversion: 1\n' });
    const result = await loadSchema(source, 'thin', { packageSchemasDir: '/pkg/schemas' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('invalid');
  });

  it('accepts a schema carrying fields specdeck does not understand', async () => {
    // Forward compatibility: only the fields specdeck uses are required, so a
    // newer OpenSpec adding keys does not break schema loading.
    const source = sourceWith({
      '/pkg/schemas/future/schema.yaml':
        'name: future\nversion: 2\nsomethingNew: true\nartifacts:\n  - id: a\n    generates: a.md\n    description: d\n    template: t\n',
    });
    const result = await loadSchema(source, 'future', { packageSchemasDir: '/pkg/schemas' });
    expect(result.ok).toBe(true);
  });

  it('treats a null tracks value as absent', async () => {
    const source = sourceWith({
      '/pkg/schemas/n/schema.yaml':
        'name: n\nversion: 1\nartifacts:\n  - id: a\n    generates: a.md\n    description: d\n    template: t\napply:\n  requires: [a]\n  tracks: null\n',
    });
    const result = await loadSchema(source, 'n', { packageSchemasDir: '/pkg/schemas' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schema.apply?.tracks).toBeUndefined();
    expect(trackedArtifact(result.schema)).toBeUndefined();
  });
});

describe('trackedArtifact', () => {
  it('finds the artifact whose checkboxes track implementation', async () => {
    const source = sourceWith({ '/pkg/schemas/spec-driven/schema.yaml': SPEC_DRIVEN });
    const result = await loadSchema(source, 'spec-driven', { packageSchemasDir: '/pkg/schemas' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(trackedArtifact(result.schema)?.id).toBe('tasks');
  });
});

describe('against the real bundled OpenSpec package', () => {
  it('resolves the built-in spec-driven schema from disk', async () => {
    // This is the assertion that catches OpenSpec moving or renaming its
    // packaged schemas, which would otherwise show up as every change having
    // no artifacts at all.
    const paths = schemaSearchPaths(undefined);
    expect(paths.packageSchemasDir).toBeDefined();

    const result = await loadSchema(new NodeFileSource(), 'spec-driven', paths);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.schema.artifacts.map((a) => a.id)).toEqual([
      'proposal',
      'specs',
      'design',
      'tasks',
    ]);
    expect(trackedArtifact(result.schema)?.generates).toBe('tasks.md');
  });

  it('resolves the built-in workspace-planning schema from disk', async () => {
    const result = await loadSchema(
      new NodeFileSource(),
      'workspace-planning',
      schemaSearchPaths(undefined),
    );
    expect(result.ok).toBe(true);
  });
});
