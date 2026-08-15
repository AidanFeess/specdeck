import { baseName, joinPath } from '../fs/pathutil.js';

import type { FileSource } from '../fs/source.js';
import { walkFiles } from '../fs/source.js';
import { localFileSource } from '../fs/node-source.js';
import { deriveArtifacts, deriveLane } from '../model/derive.js';
import type {
  Capability,
  Change,
  ChangeLocation,
  DeltaSpec,
  ParseIssue,
  PlanningHome,
  ProjectResult,
  ProjectSnapshot,
} from '../model/types.js';
import { readChangeMetadata } from '../openspec/change-metadata.js';
import {
  ARCHIVE_DIR,
  openspecDir,
  parseArchivedDirName,
  schemaSearchPaths,
  SPEC_FILE,
  workspaceMarkerDir,
} from '../openspec/paths.js';
import { conventionalPlanningHome, resolvePlanningHome } from '../openspec/planning-home.js';
import {
  describeSchemaFailure,
  loadSchema,
  type SchemaSearchPaths,
  type WorkflowSchema,
} from '../openspec/schema.js';
import { parseCapability } from '../parse/capability.js';
import { parseDeltaSpec } from '../parse/delta.js';
import { parseTasks } from '../parse/tasks.js';

/**
 * Assembles a whole project snapshot from disk.
 *
 * Every failure below is contained to the item it concerns. One malformed change
 * must never blank the board, because a board that disappears is worse than a
 * board with one item flagged.
 */

const DEFAULT_SCHEMA = 'spec-driven';

function projectIdFor(path: string): string {
  // Stable, readable, and unique enough for a local registry keyed by path.
  return path
    .replace(/[\\/:]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** Caches schema lookups for the duration of one scan. */
class SchemaCache {
  private readonly cache = new Map<string, WorkflowSchema | undefined>();

  constructor(
    private readonly source: FileSource,
    private readonly projectRoot: string,
  ) {}

  async get(name: string): Promise<{ schema?: WorkflowSchema; issue?: string }> {
    if (this.cache.has(name)) {
      const cached = this.cache.get(name);
      return cached === undefined
        ? { issue: `Unknown workflow schema "${name}".` }
        : { schema: cached };
    }

    const paths = schemaSearchPaths(this.projectRoot);

    // A project-local schema is part of the project, so it is read through the
    // project's own source. User and packaged schemas are installed on this
    // machine and are never part of the project, so they are always read from
    // the local filesystem. That distinction only becomes visible once a source
    // is something other than local, which is exactly when getting it wrong
    // would be hardest to debug.
    if (paths.projectSchemasDir !== undefined) {
      const local = await loadSchema(this.source, name, {
        projectSchemasDir: paths.projectSchemasDir,
      });
      if (local.ok) {
        this.cache.set(name, local.schema);
        return { schema: local.schema };
      }
    }

    const installedPaths: SchemaSearchPaths = {};
    if (paths.userSchemasDir !== undefined) installedPaths.userSchemasDir = paths.userSchemasDir;
    if (paths.packageSchemasDir !== undefined) {
      installedPaths.packageSchemasDir = paths.packageSchemasDir;
    }

    const installed = await loadSchema(localFileSource, name, installedPaths);
    if (!installed.ok) {
      this.cache.set(name, undefined);
      return { issue: describeSchemaFailure(name, installed.failure) };
    }
    this.cache.set(name, installed.schema);
    return { schema: installed.schema };
  }
}

async function readChange(
  source: FileSource,
  changeRoot: string,
  dirName: string,
  location: ChangeLocation,
  schemas: SchemaCache,
): Promise<Change> {
  const issues: ParseIssue[] = [];

  const { name, archivedOn } =
    location === 'archived'
      ? parseArchivedDirName(dirName)
      : { name: dirName, archivedOn: undefined };

  const { metadata, issues: metadataIssues } = await readChangeMetadata(
    source,
    changeRoot,
    DEFAULT_SCHEMA,
  );
  issues.push(...metadataIssues);

  const walked = await walkFiles(source, changeRoot, { maxDepth: 5 });
  const presentPaths = walked.map((file) => file.relativePath);

  const { schema, issue: schemaIssue } = await schemas.get(metadata.schema);
  if (schemaIssue !== undefined) {
    issues.push({ severity: 'error', message: schemaIssue, path: changeRoot });
  }

  // Tasks are parsed from the file the schema tracks, defaulting to tasks.md so a
  // schema without an apply phase still reports progress.
  const tracksRelative = schema?.apply?.tracks ?? 'tasks.md';
  const tasksPath = joinPath(changeRoot, tracksRelative);
  const tasksContent = presentPaths.includes(tracksRelative)
    ? await source.readText(tasksPath)
    : undefined;
  const tasks =
    tasksContent === undefined
      ? parseTasks(undefined, tasksPath)
      : parseTasks(tasksContent, tasksPath);

  const deltaSpecs: DeltaSpec[] = [];
  for (const file of walked) {
    const match = /^specs\/(.+)\/spec\.md$/.exec(file.relativePath);
    const capability = match?.[1];
    if (capability === undefined) continue;
    const content = await source.readText(file.path);
    if (content === undefined) continue;
    deltaSpecs.push(parseDeltaSpec(capability, file.path, content));
  }

  const artifacts =
    schema === undefined ? [] : deriveArtifacts({ schema, presentPaths, changeRoot });

  const lane =
    schema === undefined
      ? location === 'archived'
        ? 'archived'
        : 'draft'
      : deriveLane({ schema, artifacts, tasks, location });

  const change: Change = {
    name,
    dir: changeRoot,
    location,
    metadata,
    artifacts,
    deltaSpecs,
    tasks,
    lane,
    capabilities: deltaSpecs.map((delta) => delta.capability),
    issues,
  };
  if (archivedOn !== undefined) change.archivedOn = archivedOn;
  return change;
}

async function readChangesIn(
  source: FileSource,
  directory: string,
  location: ChangeLocation,
  schemas: SchemaCache,
): Promise<Change[]> {
  const entries = await source.list(directory);
  if (entries === undefined) return [];

  const changes: Change[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'directory') continue;
    if (location === 'active' && entry.name === ARCHIVE_DIR) continue;

    try {
      changes.push(
        await readChange(source, joinPath(directory, entry.name), entry.name, location, schemas),
      );
    } catch (error) {
      // Containment: a change that throws still appears, flagged.
      changes.push(brokenChange(joinPath(directory, entry.name), entry.name, location, error));
    }
  }
  return changes;
}

function brokenChange(
  dir: string,
  dirName: string,
  location: ChangeLocation,
  error: unknown,
): Change {
  return {
    name: dirName,
    dir,
    location,
    metadata: { schema: DEFAULT_SCHEMA },
    artifacts: [],
    deltaSpecs: [],
    tasks: { groups: [], completed: 0, total: 0, issues: [] },
    lane: location === 'archived' ? 'archived' : 'draft',
    capabilities: [],
    issues: [
      {
        severity: 'error',
        message: `This change could not be read: ${error instanceof Error ? error.message : String(error)}`,
        path: dir,
      },
    ],
  };
}

async function readCapabilities(source: FileSource, specsDir: string): Promise<Capability[]> {
  const entries = await source.list(specsDir);
  if (entries === undefined) return [];

  const capabilities: Capability[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'directory') continue;
    const path = joinPath(specsDir, entry.name, SPEC_FILE);
    try {
      const content = await source.readText(path);
      if (content === undefined) continue;
      capabilities.push(parseCapability(entry.name, path, content));
    } catch (error) {
      capabilities.push({
        id: entry.name,
        path,
        title: entry.name,
        requirements: [],
        issues: [
          {
            severity: 'error',
            message: `This capability could not be read: ${error instanceof Error ? error.message : String(error)}`,
            path,
          },
        ],
      });
    }
  }
  return capabilities;
}

export interface ReadProjectOptions {
  /** Overrides the display name, which otherwise comes from the directory. */
  name?: string;
  /** Injected during tests so snapshots are deterministic. */
  now?: () => Date;
}

/**
 * Reads a project into a snapshot, or reports why it could not be read.
 */
export async function readProject(
  source: FileSource,
  projectRoot: string,
  options: ReadProjectOptions = {},
): Promise<ProjectResult> {
  const id = projectIdFor(projectRoot);
  const name = options.name ?? baseName(projectRoot);
  const now = options.now ?? ((): Date => new Date());

  const root = await source.list(projectRoot);
  if (root === undefined) {
    return {
      ok: false,
      failure: {
        id,
        path: projectRoot,
        name,
        problem: 'path-missing',
        message: `${projectRoot} does not exist, or is not a directory specdeck can read.`,
      },
    };
  }

  // A repository keeps its planning in `openspec/`; a workspace keeps its
  // changes directly under the root and is identified by its marker directory
  // instead. Either one is a project specdeck can read, and requiring the
  // former would make every workspace look like an uninitialized folder.
  const openspec = await source.list(openspecDir(projectRoot));
  const workspace = await source.list(workspaceMarkerDir(projectRoot));
  if (openspec === undefined && workspace === undefined) {
    return {
      ok: false,
      failure: {
        id,
        path: projectRoot,
        name,
        problem: 'not-openspec',
        message: `${projectRoot} has no openspec directory yet.`,
      },
    };
  }

  // OpenSpec's own resolver is consulted for the local filesystem, so a project
  // whose openspec directory is not at the root still resolves the way the CLI
  // would. Any other source uses the conventional layout, which is correct for
  // every source that currently exists.
  const planningHome: PlanningHome =
    (source.id === 'local' ? resolvePlanningHome(projectRoot) : undefined) ??
    conventionalPlanningHome(projectRoot);

  const schemas = new SchemaCache(source, projectRoot);

  try {
    const [active, archived, capabilities] = await Promise.all([
      readChangesIn(source, planningHome.changesDir, 'active', schemas),
      readChangesIn(source, joinPath(planningHome.changesDir, ARCHIVE_DIR), 'archived', schemas),
      readCapabilities(source, planningHome.specsDir),
    ]);

    const snapshot: ProjectSnapshot = {
      id,
      path: projectRoot,
      name,
      planningHome,
      changes: [...active, ...archived],
      capabilities,
      issues: [],
      scannedAt: now().toISOString(),
    };
    return { ok: true, snapshot };
  } catch (error) {
    return {
      ok: false,
      failure: {
        id,
        path: projectRoot,
        name,
        problem: 'read-failed',
        message: `specdeck could not read this project: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}
