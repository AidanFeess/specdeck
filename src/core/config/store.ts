import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * specdeck's own configuration, kept entirely outside every managed project.
 *
 * Nothing here is ever written into a user's repository. The project registry
 * and all preferences live in specdeck's own directory, keyed by project path,
 * so pointing specdeck at a repository leaves that repository untouched.
 */

export type HandoffMethod = 'auto' | 'attach' | 'terminal' | 'clipboard';

/**
 * What kind of root a registry entry names.
 *
 * Absent on every entry written before OpenSpec grew workspaces and context
 * stores, which is why it is optional and resolves to `project`. Recording the
 * kind here is specdeck deciding what to show; OpenSpec's own registrations
 * remain the authority on what exists, and are never written by specdeck.
 */
export type RootKind = 'project' | 'workspace' | 'context-store';

export interface ProjectEntry {
  path: string;
  /** Optional display name overriding the directory name. */
  name?: string;
  /** Defaults to `project` for entries written before kinds existed. */
  kind?: RootKind;
  /** Overrides the global default when set. */
  handoffMethod?: HandoffMethod;
  /** Starred projects always sort above the rest. */
  starred?: boolean;
  /**
   * Explicit display position.
   *
   * A number rather than the entry's position in the array, because the array
   * is rewritten by unrelated operations such as adding and removing projects.
   * An implicit order would then shuffle for reasons the user cannot see.
   *
   * Absent means unplaced, and unplaced entries sort after placed ones in the
   * sequence the file lists them, so an existing configuration opens looking
   * exactly as it did before.
   */
  order?: number;
}

/**
 * The remembered application for opening documents.
 *
 * Global rather than per project, because it describes the person rather than
 * the repository. Absent means specdeck asks each time.
 */
export interface EditorPreference {
  /** `system` hands the file to the operating system's own handler. */
  kind: 'system' | 'command';
  /** Command or absolute path. Absent for the system default. */
  command?: string;
  /** Shown in settings so the user recognises what they picked. */
  label?: string;
}

function isRootKind(value: unknown): value is RootKind {
  return value === 'project' || value === 'workspace' || value === 'context-store';
}

/** The kind of a registry entry, defaulting the way an old entry should read. */
export function rootKind(entry: ProjectEntry): RootKind {
  return entry.kind ?? 'project';
}

export interface SpecdeckConfig {
  version: 1;
  defaults: { handoffMethod: HandoffMethod; editor?: EditorPreference };
  projects: ProjectEntry[];
}

/** Stores or clears the remembered editor. */
export async function setEditorPreference(
  preference: EditorPreference | undefined,
): Promise<SpecdeckConfig> {
  const config = await readConfig();
  if (preference === undefined) delete config.defaults.editor;
  else config.defaults.editor = preference;
  await writeConfig(config);
  return config;
}

const DEFAULT_CONFIG: SpecdeckConfig = {
  version: 1,
  defaults: { handoffMethod: 'auto' },
  projects: [],
};

export function configDir(): string {
  const override = process.env.SPECDECK_CONFIG_DIR;
  if (override !== undefined && override !== '') return override;
  return join(homedir(), '.specdeck');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

function coerce(parsed: unknown): SpecdeckConfig {
  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_CONFIG };
  const root = parsed as Record<string, unknown>;

  const projects: ProjectEntry[] = [];
  if (Array.isArray(root.projects)) {
    for (const raw of root.projects) {
      if (typeof raw !== 'object' || raw === null) continue;
      const entry = raw as Record<string, unknown>;
      if (typeof entry.path !== 'string' || entry.path === '') continue;
      const project: ProjectEntry = { path: entry.path };
      if (typeof entry.name === 'string' && entry.name !== '') project.name = entry.name;
      // An entry with no kind, or with one this version does not recognize,
      // reads as a plain project. Dropping it would lose a root the user
      // registered, which is a far worse outcome than showing it as a project.
      if (isRootKind(entry.kind)) project.kind = entry.kind;
      if (isHandoffMethod(entry.handoffMethod)) project.handoffMethod = entry.handoffMethod;
      if (entry.starred === true) project.starred = true;
      if (typeof entry.order === 'number' && Number.isFinite(entry.order)) {
        project.order = entry.order;
      }
      // Any other key is dropped rather than carried, so a configuration written
      // by a newer version still loads here instead of failing.
      projects.push(project);
    }
  }

  const defaults = (root.defaults ?? {}) as Record<string, unknown>;
  const config: SpecdeckConfig = {
    version: 1,
    defaults: {
      handoffMethod: isHandoffMethod(defaults.handoffMethod) ? defaults.handoffMethod : 'auto',
    },
    projects,
  };

  const editor = defaults.editor;
  if (typeof editor === 'object' && editor !== null) {
    const record = editor as Record<string, unknown>;
    if (record.kind === 'system') {
      config.defaults.editor = { kind: 'system' };
    } else if (
      record.kind === 'command' &&
      typeof record.command === 'string' &&
      record.command !== ''
    ) {
      const preference: EditorPreference = { kind: 'command', command: record.command };
      if (typeof record.label === 'string' && record.label !== '') preference.label = record.label;
      config.defaults.editor = preference;
    }
  }

  return config;
}

function isHandoffMethod(value: unknown): value is HandoffMethod {
  return value === 'auto' || value === 'attach' || value === 'terminal' || value === 'clipboard';
}

/**
 * Decides whether two recorded paths name the same folder.
 *
 * One directory can be spelled several ways: forward or backward slashes, a
 * trailing separator, a relative segment, a different drive letter case on
 * Windows. Comparing the strings treats those as different projects, which is
 * how a single folder ends up listed twice and how an update silently appends a
 * duplicate instead of changing the entry it meant to change.
 *
 * The stored spelling is left exactly as written. Only the comparison is
 * normalized, so reading a configuration never rewrites it.
 */
export function pathKey(path: string): string {
  const resolved = resolve(path);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b);
}

function findProject(config: SpecdeckConfig, path: string): ProjectEntry | undefined {
  return config.projects.find((project) => samePath(project.path, path));
}

/**
 * Reads the config, falling back to defaults.
 *
 * A corrupt config file must not stop specdeck from starting. Losing preferences
 * is recoverable; refusing to launch is not.
 */
export async function readConfig(): Promise<SpecdeckConfig> {
  try {
    const raw = await readFile(configPath(), 'utf8');
    return coerce(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONFIG, projects: [] };
  }
}

export async function writeConfig(config: SpecdeckConfig): Promise<void> {
  await mkdir(dirname(configPath()), { recursive: true });
  await writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/**
 * Adds a root to specdeck's registry.
 *
 * Deliberately runs no OpenSpec command. A workspace or context store exists
 * because OpenSpec says it does; this only records that the user wants it on
 * their dashboard, so removing it here can never unregister anything.
 */
export async function addProject(
  path: string,
  kind: RootKind = 'project',
): Promise<SpecdeckConfig> {
  const config = await readConfig();
  // Compared with `samePath` rather than by string equality, so the same folder
  // reached by a different spelling is not registered twice.
  if (findProject(config, path) === undefined) {
    const entry: ProjectEntry = { path };
    if (kind !== 'project') entry.kind = kind;
    config.projects.push(entry);
    await writeConfig(config);
  }
  return config;
}

export async function removeProject(path: string): Promise<SpecdeckConfig> {
  const config = await readConfig();
  config.projects = config.projects.filter((project) => !samePath(project.path, path));
  await writeConfig(config);
  return config;
}

/** Resolves the effective handoff method for a project. */
export function effectiveHandoffMethod(config: SpecdeckConfig, path: string): HandoffMethod {
  return findProject(config, path)?.handoffMethod ?? config.defaults.handoffMethod;
}

/**
 * Sets or clears a project's star.
 *
 * A project that is not yet registered is added, because starring one from the
 * projects view is a reasonable way to adopt the currently open project.
 */
export async function setProjectStarred(path: string, starred: boolean): Promise<SpecdeckConfig> {
  const config = await readConfig();
  const entry = findProject(config, path);

  if (entry === undefined) {
    config.projects.push(starred ? { path, starred: true } : { path });
  } else if (starred) {
    entry.starred = true;
  } else {
    delete entry.starred;
  }

  await writeConfig(config);
  return config;
}

/**
 * Records an explicit arrangement.
 *
 * The caller supplies the paths in their intended order. Every path it names is
 * given a position; anything it omits keeps whatever it had, so reordering a
 * filtered subset cannot silently discard the placement of hidden projects.
 */
export async function setProjectOrder(orderedPaths: string[]): Promise<SpecdeckConfig> {
  const config = await readConfig();

  orderedPaths.forEach((path, index) => {
    const entry = findProject(config, path);
    if (entry === undefined) config.projects.push({ path, order: index });
    else entry.order = index;
  });

  await writeConfig(config);
  return config;
}
