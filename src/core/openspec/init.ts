import { getWorkspaceSkillCapableTools } from '@fission-ai/openspec';

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
  /**
   * True when this tool writes outside the project directory.
   *
   * Codex resolves its command directory from CODEX_HOME (defaulting to the
   * user's home directory), so initializing for it touches files well outside
   * the folder the user pointed at. That has to be disclosed before it runs,
   * not discovered afterwards.
   */
  writesOutsideProject: boolean;
  /** True when files for this tool already exist in the project. */
  detected: boolean;
}

const WRITES_OUTSIDE_PROJECT = new Set(['codex']);

interface RegistryEntry {
  value?: unknown;
  name?: unknown;
  skillsDir?: unknown;
}

/**
 * Lists the tools OpenSpec can configure, preselecting any already present.
 *
 * The registry comes from the OpenSpec package. If that export ever disappears,
 * a small fallback keeps initialization usable rather than failing outright,
 * because a missing picker should not block the one feature that gets a project
 * started.
 */
export async function listInitTools(source: FileSource, projectRoot: string): Promise<InitTool[]> {
  let entries: RegistryEntry[];
  try {
    entries = getWorkspaceSkillCapableTools();
  } catch {
    entries = [
      { value: 'claude', name: 'Claude Code', skillsDir: '.claude' },
      { value: 'cursor', name: 'Cursor', skillsDir: '.cursor' },
      { value: 'codex', name: 'Codex', skillsDir: '.codex' },
    ];
  }

  const tools: InitTool[] = [];
  for (const entry of entries) {
    const id = typeof entry.value === 'string' ? entry.value : undefined;
    if (id === undefined) continue;

    const skillsDir = typeof entry.skillsDir === 'string' ? entry.skillsDir : undefined;
    const detected =
      skillsDir !== undefined &&
      (await source.list(joinPath(projectRoot, ...skillsDir.split('/')))) !== undefined;

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
  return ['init', '.', '--tools', toolIds.length > 0 ? toolIds.join(',') : 'none'];
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
      : (result.failure === 'missing-openspec' && result.message !== undefined
          ? result.message
          : 'Initialization did not complete. You can run the command yourself instead.'),
  };
}
