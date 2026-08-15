import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

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
  defaults: { handoffMethod: HandoffMethod };
  projects: ProjectEntry[];
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
      projects.push(project);
    }
  }

  const defaults = (root.defaults ?? {}) as Record<string, unknown>;
  return {
    version: 1,
    defaults: {
      handoffMethod: isHandoffMethod(defaults.handoffMethod) ? defaults.handoffMethod : 'auto',
    },
    projects,
  };
}

function isHandoffMethod(value: unknown): value is HandoffMethod {
  return value === 'auto' || value === 'attach' || value === 'terminal' || value === 'clipboard';
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
  if (!config.projects.some((project) => project.path === path)) {
    const entry: ProjectEntry = { path };
    if (kind !== 'project') entry.kind = kind;
    config.projects.push(entry);
    await writeConfig(config);
  }
  return config;
}

export async function removeProject(path: string): Promise<SpecdeckConfig> {
  const config = await readConfig();
  config.projects = config.projects.filter((project) => project.path !== path);
  await writeConfig(config);
  return config;
}

/** Resolves the effective handoff method for a project. */
export function effectiveHandoffMethod(config: SpecdeckConfig, path: string): HandoffMethod {
  const project = config.projects.find((entry) => entry.path === path);
  return project?.handoffMethod ?? config.defaults.handoffMethod;
}
