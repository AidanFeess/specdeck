import { parse as parseYaml } from 'yaml';

import type { FileSource } from '../fs/source.js';

/**
 * Workflow schema loading.
 *
 * A change declares which schema it uses, and the schema declares which
 * artifacts exist, what each generates, and what each depends on. specdeck
 * reads that rather than hardcoding proposal, specs, design, and tasks, because
 * a project can define its own schema with entirely different artifacts.
 *
 * Resolution order matches OpenSpec's own, so specdeck resolves the same schema
 * the CLI would for the same change:
 *
 *   1. <projectRoot>/openspec/schemas/<name>/schema.yaml   project-local
 *   2. <globalDataDir>/schemas/<name>/schema.yaml          user override
 *   3. <packageRoot>/schemas/<name>/schema.yaml            built in
 *
 * Note these are read as files, not imported as modules, so the package's
 * `exports` restriction does not apply.
 */

export interface SchemaArtifact {
  id: string;
  /** Output path or glob relative to the change root, for example `specs/**\/*.md`. */
  generates: string;
  description: string;
  /** Artifact ids that must exist before this one is considered unblocked. */
  requires: string[];
}

export interface SchemaApplyPhase {
  requires: string[];
  /** The file whose checkboxes track implementation progress, usually `tasks.md`. */
  tracks?: string;
}

export interface WorkflowSchema {
  name: string;
  version: number;
  description?: string;
  artifacts: SchemaArtifact[];
  apply?: SchemaApplyPhase;
  /** Where this definition was found, for diagnostics. */
  source: 'project' | 'user' | 'package';
  path: string;
}

export type SchemaLoadFailure =
  | { reason: 'not-found'; searched: string[] }
  | { reason: 'unreadable'; path: string; detail: string }
  | { reason: 'invalid'; path: string; detail: string };

export type SchemaLoadResult =
  | { ok: true; schema: WorkflowSchema }
  | { ok: false; failure: SchemaLoadFailure };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Validates the parsed YAML into a schema.
 *
 * Deliberately hand-rolled rather than reusing OpenSpec's zod schemas, which are
 * not exported. Only the fields specdeck actually uses are required, so a schema
 * carrying fields specdeck does not understand still loads.
 */
function validate(
  parsed: unknown,
  path: string,
  source: WorkflowSchema['source'],
): SchemaLoadResult {
  const root = asRecord(parsed);
  if (root === undefined) {
    return { ok: false, failure: { reason: 'invalid', path, detail: 'not a YAML mapping' } };
  }

  const name = root.name;
  if (typeof name !== 'string' || name === '') {
    return { ok: false, failure: { reason: 'invalid', path, detail: 'missing a schema name' } };
  }

  if (!Array.isArray(root.artifacts)) {
    return {
      ok: false,
      failure: { reason: 'invalid', path, detail: 'missing an artifacts list' },
    };
  }

  const artifacts: SchemaArtifact[] = [];
  for (const [index, raw] of root.artifacts.entries()) {
    const artifact = asRecord(raw);
    const id = artifact?.id;
    const generates = artifact?.generates;
    if (typeof id !== 'string' || typeof generates !== 'string') {
      return {
        ok: false,
        failure: {
          reason: 'invalid',
          path,
          detail: `artifact ${index + 1} is missing an id or a generates path`,
        },
      };
    }
    artifacts.push({
      id,
      generates,
      description: typeof artifact?.description === 'string' ? artifact.description : '',
      requires: asStringArray(artifact?.requires),
    });
  }

  const schema: WorkflowSchema = {
    name,
    version: typeof root.version === 'number' ? root.version : 1,
    artifacts,
    source,
    path,
  };

  if (typeof root.description === 'string') schema.description = root.description;

  const apply = asRecord(root.apply);
  if (apply !== undefined) {
    const phase: SchemaApplyPhase = { requires: asStringArray(apply.requires) };
    // `tracks` is nullable in OpenSpec's own definition, so null must be
    // treated as absent rather than propagated as a path.
    if (typeof apply.tracks === 'string' && apply.tracks !== '') phase.tracks = apply.tracks;
    schema.apply = phase;
  }

  return { ok: true, schema };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export interface SchemaSearchPaths {
  /** `<projectRoot>/openspec/schemas`, when a project root is known. */
  projectSchemasDir?: string;
  /** `<globalDataDir>/schemas`, when it can be determined. */
  userSchemasDir?: string;
  /** `<packageRoot>/schemas` of the bundled OpenSpec package. */
  packageSchemasDir?: string;
}

function joinPath(base: string, ...parts: string[]): string {
  const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  const trimmed = base.endsWith(separator) ? base.slice(0, -1) : base;
  return [trimmed, ...parts].join(separator);
}

/**
 * Loads a named workflow schema, trying each location in OpenSpec's order.
 */
export async function loadSchema(
  source: FileSource,
  name: string,
  paths: SchemaSearchPaths,
): Promise<SchemaLoadResult> {
  const candidates: Array<{ dir: string; origin: WorkflowSchema['source'] }> = [];
  if (paths.projectSchemasDir !== undefined) {
    candidates.push({ dir: paths.projectSchemasDir, origin: 'project' });
  }
  if (paths.userSchemasDir !== undefined) {
    candidates.push({ dir: paths.userSchemasDir, origin: 'user' });
  }
  if (paths.packageSchemasDir !== undefined) {
    candidates.push({ dir: paths.packageSchemasDir, origin: 'package' });
  }

  const searched: string[] = [];

  for (const candidate of candidates) {
    const schemaPath = joinPath(candidate.dir, name, 'schema.yaml');
    searched.push(schemaPath);

    let text: string | undefined;
    try {
      text = await source.readText(schemaPath);
    } catch (error) {
      return {
        ok: false,
        failure: {
          reason: 'unreadable',
          path: schemaPath,
          detail: error instanceof Error ? error.message : String(error),
        },
      };
    }
    if (text === undefined) continue;

    let parsed: unknown;
    try {
      parsed = parseYaml(text);
    } catch (error) {
      return {
        ok: false,
        failure: {
          reason: 'invalid',
          path: schemaPath,
          detail: error instanceof Error ? error.message : String(error),
        },
      };
    }

    return validate(parsed, schemaPath, candidate.origin);
  }

  return { ok: false, failure: { reason: 'not-found', searched } };
}

/**
 * Renders a load failure as something a user can act on.
 */
export function describeSchemaFailure(name: string, failure: SchemaLoadFailure): string {
  switch (failure.reason) {
    case 'not-found':
      return (
        `Could not find the workflow schema "${name}". specdeck looked in: ` +
        `${failure.searched.join(', ')}.`
      );
    case 'unreadable':
      return `Could not read the schema at ${failure.path}: ${failure.detail}`;
    case 'invalid':
      return `The schema at ${failure.path} could not be understood: ${failure.detail}`;
  }
}

/**
 * The artifact whose checkboxes track implementation, if the schema declares one.
 */
export function trackedArtifact(schema: WorkflowSchema): SchemaArtifact | undefined {
  const tracks = schema.apply?.tracks;
  if (tracks === undefined) return undefined;
  return schema.artifacts.find((artifact) => artifact.generates === tracks);
}
