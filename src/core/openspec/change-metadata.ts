import { parse as parseYaml } from 'yaml';

import type { FileSource } from '../fs/source.js';
import type { ChangeMetadata, ParseIssue } from '../model/types.js';
import { changeMetadataPath } from './paths.js';

/**
 * Reading a change's `.openspec.yaml`.
 *
 * The file is small and usually just a schema name and a creation date, but it
 * is the only place a change declares which workflow it follows, and everything
 * about that change's artifacts follows from that declaration.
 *
 * A change directory created by hand may have no metadata file at all. That is
 * treated as a warning with a default schema rather than an error, because the
 * change is still perfectly readable and refusing to show it would hide real
 * work from the board.
 */

export interface ChangeMetadataResult {
  metadata: ChangeMetadata;
  issues: ParseIssue[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/**
 * Normalizes OpenSpec's `created` field to a plain date string.
 *
 * The YAML parser resolves an unquoted `2026-08-14` to a Date, so the raw value
 * can arrive as either a string or a Date depending on how it was written. Both
 * are reduced to `YYYY-MM-DD`, and the value is deliberately not widened into a
 * timestamp: OpenSpec records a date, and pretending to know the time would make
 * the timeline claim precision it does not have.
 */
function normalizeCreated(value: unknown): string | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length > 0 ? items : undefined;
}

/**
 * Parses metadata content that has already been read.
 *
 * Separated from the read so it can be tested directly against strings, and so
 * a caller that already holds the file content does not read it twice.
 */
export function parseChangeMetadata(
  text: string | undefined,
  path: string,
  defaultSchema: string,
): ChangeMetadataResult {
  const issues: ParseIssue[] = [];

  if (text === undefined) {
    issues.push({
      severity: 'warning',
      message:
        'This change has no .openspec.yaml, so its workflow schema is assumed to be ' +
        `"${defaultSchema}". It was probably created by hand rather than by "openspec new change".`,
      path,
    });
    return { metadata: { schema: defaultSchema }, issues };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (error) {
    issues.push({
      severity: 'error',
      message:
        `Could not read this change's metadata: ${error instanceof Error ? error.message : String(error)}. ` +
        `Assuming the "${defaultSchema}" schema.`,
      path,
    });
    return { metadata: { schema: defaultSchema }, issues };
  }

  const root = asRecord(parsed);
  if (root === undefined) {
    issues.push({
      severity: 'error',
      message: `This change's metadata is not a YAML mapping. Assuming the "${defaultSchema}" schema.`,
      path,
    });
    return { metadata: { schema: defaultSchema }, issues };
  }

  const schema = typeof root.schema === 'string' && root.schema !== '' ? root.schema : undefined;
  if (schema === undefined) {
    issues.push({
      severity: 'warning',
      message: `This change's metadata does not name a schema. Assuming "${defaultSchema}".`,
      path,
    });
  }

  const metadata: ChangeMetadata = { schema: schema ?? defaultSchema };

  const created = normalizeCreated(root.created);
  if (created !== undefined) metadata.created = created;

  if (typeof root.goal === 'string' && root.goal !== '') metadata.goal = root.goal;

  // OpenSpec writes this key in snake case.
  const areas = asStringArray(root.affected_areas);
  if (areas !== undefined) metadata.affectedAreas = areas;

  const initiative = asRecord(root.initiative);
  if (initiative !== undefined) {
    const store = initiative.store;
    const id = initiative.id;
    if (typeof store === 'string' && typeof id === 'string') {
      metadata.initiative = { store, id };
    } else {
      issues.push({
        severity: 'warning',
        message: 'This change links to an initiative, but the link is missing a store or an id.',
        path,
      });
    }
  }

  return { metadata, issues };
}

/**
 * Reads and parses a change's metadata from its directory.
 */
export async function readChangeMetadata(
  source: FileSource,
  changeRoot: string,
  defaultSchema: string,
): Promise<ChangeMetadataResult> {
  const path = changeMetadataPath(changeRoot);

  let text: string | undefined;
  try {
    text = await source.readText(path);
  } catch (error) {
    return {
      metadata: { schema: defaultSchema },
      issues: [
        {
          severity: 'error',
          message:
            `Could not read this change's metadata file: ` +
            `${error instanceof Error ? error.message : String(error)}`,
          path,
        },
      ],
    };
  }

  return parseChangeMetadata(text, path, defaultSchema);
}
