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

export interface ProjectEntry {
  path: string;
  /** Optional display name overriding the directory name. */
  name?: string;
  /** Overrides the global default when set. */
  handoffMethod?: HandoffMethod;
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

export async function addProject(path: string): Promise<SpecdeckConfig> {
  const config = await readConfig();
  if (!config.projects.some((project) => project.path === path)) {
    config.projects.push({ path });
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
