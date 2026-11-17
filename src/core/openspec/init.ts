import { KNOWN_TOOLS } from './harness.js';
import { pathToFileURL } from 'node:url';
import { findBundledOpenSpecRoot } from './installed.js';

import { openspecCommand, runOpenspec } from './run.js';
import { joinPath } from '../fs/pathutil.js';
import type { FileSource } from '../fs/source.js';

/**
 * Initializing OpenSpec in a folder that does not have it.
 *
 * This is the one place specdeck creates files in a project, and it does so by
 * running OpenSpec's own command rather than writing the structure itself. That
 * matters for a reason beyond politeness: the generated agent files differ by
 * OpenSpec version and by the user's global settings, and a hand-rolled copy
 * would drift the moment either changed.
 */

export interface InitTool {
  id: string;
  label: string;
  /** Project-relative directory the tool's files go into. */
  skillsDir?: string;
  /** Project-scoped initialization does not install skills in the user's home. */
  writesOutsideProject: boolean;
  /** True when files for this tool already exist in the project. */
  detected: boolean;
}

const WRITES_OUTSIDE_PROJECT = new Set<string>();

interface RegistryEntry {
  value?: unknown;
  name?: unknown;
  skillsDir?: unknown;
  detectionPaths?: unknown;
  available?: unknown;
}

/** Lists the pinned CLI's tool registry, preselecting tool-specific project files. */
export async function listInitTools(source: FileSource, projectRoot: string): Promise<InitTool[]> {
  // OpenSpec 2 no longer exports its tool registry. Offer the adapters covered
  // by our real init drift check, plus its universal shared-skills target.
  let entries: RegistryEntry[] = [
    ...KNOWN_TOOLS.map((tool) => ({ value: tool.id, name: tool.label, skillsDir: tool.configDir })),
    { value: 'agents', name: 'Other / shared skills', skillsDir: '.agents' },
  ];
  const packageRoot = findBundledOpenSpecRoot();
  if (packageRoot) {
    // Private, pinned compatibility seam: checked by integration tests. Avoid
    // a static import of the removed 1.x export, which prevents startup entirely.
    const registry = (await import(
      pathToFileURL(joinPath(packageRoot, 'dist', 'core', 'config.js')).href
    )) as { AI_TOOLS?: RegistryEntry[] };
    if (!Array.isArray(registry.AI_TOOLS))
      throw new Error('The bundled OpenSpec tool registry is unreadable.');
    entries = registry.AI_TOOLS.filter((entry: RegistryEntry) => entry.available !== false);
  }

  const tools: InitTool[] = [];
  for (const entry of entries) {
    const id = typeof entry.value === 'string' ? entry.value : undefined;
    if (id === undefined) continue;

    const skillsDir = typeof entry.skillsDir === 'string' ? entry.skillsDir : undefined;
    const detectionPaths = Array.isArray(entry.detectionPaths)
      ? entry.detectionPaths.filter(
          (p): p is string => typeof p === 'string' && !p.startsWith('.agents'),
        )
      : skillsDir
        ? [skillsDir]
        : [];
    const detected = (
      await Promise.all(
        detectionPaths.map((p) => source.list(joinPath(projectRoot, ...p.split('/')))),
      )
    ).some((entries) => entries !== undefined);

    const tool: InitTool = {
      id,
      label: typeof entry.name === 'string' ? entry.name : id,
      writesOutsideProject: WRITES_OUTSIDE_PROJECT.has(id),
      detected,
    };
    if (skillsDir !== undefined) tool.skillsDir = skillsDir;
    tools.push(tool);
  }

  return tools.sort((a, b) => {
    if (a.detected !== b.detected) return a.detected ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

function initArgs(toolIds: string[]): string[] {
  // Tools are always passed explicitly, because the command is interactive
  // without them and would wait for input that cannot arrive.
  return [
    'init',
    '.',
    '--scope',
    'project',
    '--tools',
    toolIds.length > 0 ? toolIds.join(',') : 'none',
  ];
}

/** The exact command specdeck would run, for the user to copy and run instead. */
export function initCommand(toolIds: string[]): string {
  return openspecCommand(initArgs(toolIds));
}

export interface InitOutcome {
  ok: boolean;
  /** The command that ran, so a failure report is reproducible by hand. */
  command: string;
  exitCode: number;
  output: string;
  message: string;
}

/**
 * Runs `openspec init` in a directory using the bundled OpenSpec.
 *
 * The bundled binary is used rather than whatever is on PATH, so a user who has
 * never installed OpenSpec can still start a project. Tools are always passed
 * explicitly, because the command is interactive without them and would hang.
 */
export async function runInit(projectRoot: string, toolIds: string[]): Promise<InitOutcome> {
  const result = await runOpenspec(projectRoot, initArgs(toolIds));

  return {
    ok: result.ok,
    command: result.command,
    exitCode: result.code,
    output: result.output,
    message: result.ok
      ? 'OpenSpec is set up in this folder.'
      : result.failure === 'missing-openspec' && result.message !== undefined
        ? result.message
        : 'Initialization did not complete. You can run the command yourself instead.',
  };
}
