import { joinPath } from '../fs/pathutil.js';

import { getGlobalDataDir } from '@fission-ai/openspec';

import { findBundledOpenSpecRoot } from './installed.js';
import type { SchemaSearchPaths } from './schema.js';

/**
 * Well-known locations inside an OpenSpec project, and the three places a
 * workflow schema can live.
 *
 * The directory names are fixed by OpenSpec, so they are named here once rather
 * than being spelled out at each call site.
 */

export const OPENSPEC_DIR = 'openspec';
/**
 * Marks a directory as an OpenSpec workspace root.
 *
 * A workspace keeps its changes directly under the root rather than inside an
 * `openspec/` directory, so this is the only thing that distinguishes one from
 * an ordinary folder.
 */
export const WORKSPACE_DIR = '.openspec-workspace';
export const CHANGES_DIR = 'changes';
export const ARCHIVE_DIR = 'archive';
export const SPECS_DIR = 'specs';
export const SCHEMAS_DIR = 'schemas';
export const CHANGE_METADATA_FILE = '.openspec.yaml';
export const SPEC_FILE = 'spec.md';

export function workspaceMarkerDir(projectRoot: string): string {
  return joinPath(projectRoot, WORKSPACE_DIR);
}

export function openspecDir(projectRoot: string): string {
  return joinPath(projectRoot, OPENSPEC_DIR);
}

export function changesDir(projectRoot: string): string {
  return joinPath(openspecDir(projectRoot), CHANGES_DIR);
}

export function archiveDir(projectRoot: string): string {
  return joinPath(changesDir(projectRoot), ARCHIVE_DIR);
}

export function mainSpecsDir(projectRoot: string): string {
  return joinPath(openspecDir(projectRoot), SPECS_DIR);
}

export function projectSchemasDir(projectRoot: string): string {
  return joinPath(openspecDir(projectRoot), SCHEMAS_DIR);
}

export function changeDir(projectRoot: string, changeName: string): string {
  return joinPath(changesDir(projectRoot), changeName);
}

export function changeMetadataPath(changeRoot: string): string {
  return joinPath(changeRoot, CHANGE_METADATA_FILE);
}

/**
 * Assembles the schema search paths for a project.
 *
 * The user override directory comes from OpenSpec's own `getGlobalDataDir`,
 * which follows the XDG specification with per-platform fallbacks. Reimplementing
 * that would drift, so it is delegated even though it is one of the few places
 * specdeck calls into the package at runtime.
 *
 * Any of the three may be absent. A missing package root in particular is
 * survivable: a project using only the built-in schema names will simply fail to
 * resolve, and the caller reports that rather than crashing.
 */
export function schemaSearchPaths(projectRoot: string | undefined): SchemaSearchPaths {
  const paths: SchemaSearchPaths = {};

  if (projectRoot !== undefined) {
    paths.projectSchemasDir = projectSchemasDir(projectRoot);
  }

  try {
    paths.userSchemasDir = joinPath(getGlobalDataDir(), SCHEMAS_DIR);
  } catch {
    // A platform where the data directory cannot be determined still gets the
    // project-local and package schemas, which covers every default setup.
  }

  const packageRoot = findBundledOpenSpecRoot();
  if (packageRoot !== undefined) {
    paths.packageSchemasDir = joinPath(packageRoot, SCHEMAS_DIR);
  }

  return paths;
}

/**
 * Splits an archived change directory name into its date prefix and change name.
 *
 * OpenSpec archives as `<YYYY-MM-DD>-<name>`. A directory that does not match
 * keeps its whole name and reports no date, because an unrecognized prefix is
 * more likely a hand-made directory than a corrupt one.
 */
export function parseArchivedDirName(dirName: string): { name: string; archivedOn?: string } {
  const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(dirName);
  if (!match) return { name: dirName };

  const [, date, name] = match;
  if (date === undefined || name === undefined) return { name: dirName };
  return { name, archivedOn: date };
}
