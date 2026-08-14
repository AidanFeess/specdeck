import type { FileSource } from '../fs/source.js';
import { walkFiles } from '../fs/source.js';
import { joinPath } from '../fs/pathutil.js';

/**
 * Detecting which AI tools a project has OpenSpec wired into, and building the
 * payload that hands a change to one of them.
 *
 * The payload is the same for every tool. OpenSpec's generated skill files are
 * self driving: they instruct the agent to run `openspec status` and
 * `openspec instructions` and work the rest out itself. So specdeck never
 * templates a prompt and never embeds spec content, which means the payload
 * cannot go stale as OpenSpec evolves. Only the delivery differs.
 */

export type HandoffDelivery = 'clipboard' | 'terminal' | 'attach';

export interface KnownTool {
  id: string;
  label: string;
  /** Project-relative directory the tool keeps its configuration in. */
  configDir: string;
  /** Project-relative directory OpenSpec writes skills into, when it does. */
  skillsDir?: string;
  /** Project-relative directory OpenSpec writes slash commands into. */
  commandsDir?: string;
  /** How a generated command is invoked, given an artifact id. */
  slash?: 'colon' | 'dash';
}

/**
 * Tools specdeck can detect from files inside the project.
 *
 * This table is not exhaustive and cannot be. OpenSpec does not export its
 * per-tool paths, so these are recorded from observed output and will drift.
 * An unknown tool is not a failure: the copy path works for every tool, which is
 * exactly why it is the one that gets polished.
 */
export const KNOWN_TOOLS: KnownTool[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    configDir: '.claude',
    skillsDir: '.claude/skills',
    commandsDir: '.claude/commands/opsx',
    slash: 'colon',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    configDir: '.cursor',
    skillsDir: '.cursor/skills',
    commandsDir: '.cursor/commands',
    slash: 'dash',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    configDir: '.windsurf',
    skillsDir: '.windsurf/skills',
    commandsDir: '.windsurf/workflows',
    slash: 'dash',
  },
  {
    id: 'opencode',
    label: 'opencode',
    configDir: '.opencode',
    skillsDir: '.opencode/skills',
    commandsDir: '.opencode/commands',
    slash: 'dash',
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    configDir: '.gemini',
    skillsDir: '.gemini/skills',
    commandsDir: '.gemini/commands/opsx',
    slash: 'colon',
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    configDir: '.github',
    skillsDir: '.github/skills',
    commandsDir: '.github/prompts',
    slash: 'dash',
  },
  {
    id: 'kilocode',
    label: 'Kilo Code',
    configDir: '.kilocode',
    skillsDir: '.kilocode/skills',
    commandsDir: '.kilocode/workflows',
    slash: 'dash',
  },
  {
    id: 'roocode',
    label: 'Roo Code',
    configDir: '.roo',
    skillsDir: '.roo/skills',
    commandsDir: '.roo/commands',
    slash: 'dash',
  },
];

/**
 * Tools whose OpenSpec files land outside the project entirely.
 *
 * Codex resolves its command directory from CODEX_HOME, defaulting to the user's
 * home folder. An initialized codex project therefore contains no codex files at
 * all, which means specdeck cannot tell "configured" from "not configured" by
 * looking at the project. Reporting it as absent would be a confident lie, so it
 * is reported as undetectable instead.
 */
export const UNDETECTABLE_TOOLS: Array<{ id: string; label: string; reason: string }> = [
  {
    id: 'codex',
    label: 'Codex',
    reason:
      'Codex keeps its OpenSpec commands in your home folder rather than in the project, so ' +
      'specdeck cannot tell from here whether it is set up.',
  },
];

export type HarnessState = 'configured' | 'present-not-wired' | 'undetectable' | 'absent';

export interface DetectedHarness {
  id: string;
  label: string;
  state: HarnessState;
  /** Generated files that proved configuration, project-relative. */
  evidence: string[];
  /** Invocations OpenSpec generated, for example `/opsx:apply`. */
  commands: string[];
  /** Explains an undetectable state, written for the interface. */
  note?: string;
}

const OPENSPEC_SKILL = /(?:^|\/)openspec-[a-z-]+\/SKILL\.md$/i;
const OPSX_COMMAND = /(?:^|\/)(?:opsx[:-])?([a-z-]+)\.(?:md|toml|prompt\.md)$/i;

/**
 * Detects one tool's state from files inside the project.
 *
 * The presence of a tool's own directory is deliberately not enough. Almost
 * every repository has a `.github` directory, and treating that as "configured"
 * would offer a handoff that cannot possibly work.
 */
async function detectTool(
  source: FileSource,
  projectRoot: string,
  tool: KnownTool,
): Promise<DetectedHarness> {
  const evidence: string[] = [];
  const commands: string[] = [];

  if (tool.skillsDir !== undefined) {
    const skills = await walkFiles(source, joinPath(projectRoot, ...tool.skillsDir.split('/')), {
      maxDepth: 2,
    });
    for (const file of skills) {
      if (OPENSPEC_SKILL.test(file.relativePath)) {
        evidence.push(`${tool.skillsDir}/${file.relativePath}`);
      }
    }
  }

  if (tool.commandsDir !== undefined) {
    const entries = await source.list(joinPath(projectRoot, ...tool.commandsDir.split('/')));
    for (const entry of entries ?? []) {
      if (entry.kind !== 'file') continue;
      const match = OPSX_COMMAND.exec(entry.name);
      const verb = match?.[1];
      if (verb === undefined) continue;
      evidence.push(`${tool.commandsDir}/${entry.name}`);
      commands.push(tool.slash === 'colon' ? `/opsx:${verb}` : `/opsx-${verb}`);
    }
  }

  if (evidence.length > 0) {
    return { id: tool.id, label: tool.label, state: 'configured', evidence, commands: commands.sort() };
  }

  const configured = await source.list(joinPath(projectRoot, ...tool.configDir.split('/')));
  return {
    id: tool.id,
    label: tool.label,
    state: configured === undefined ? 'absent' : 'present-not-wired',
    evidence: [],
    commands: [],
  };
}

export async function detectHarnesses(
  source: FileSource,
  projectRoot: string,
): Promise<DetectedHarness[]> {
  const results = await Promise.all(
    KNOWN_TOOLS.map((tool) => detectTool(source, projectRoot, tool)),
  );

  const undetectable: DetectedHarness[] = UNDETECTABLE_TOOLS.map((tool) => ({
    id: tool.id,
    label: tool.label,
    state: 'undetectable' as const,
    evidence: [],
    commands: [],
    note: tool.reason,
  }));

  return [...results.filter((result) => result.state !== 'absent'), ...undetectable];
}

export interface HandoffPayload {
  /** The single line handed to whichever agent the user is using. */
  text: string;
  /** The generated slash command, when the detected tool has one. */
  command?: string;
  /** What the user should expect, written for the interface. */
  note: string;
  delivery: HandoffDelivery;
}

/**
 * Builds the handoff for a change.
 *
 * `verb` is an OpenSpec workflow name (`propose`, `apply`, `archive`), chosen by
 * the caller from the change's current state.
 */
export function buildHandoff(
  changeName: string,
  verb: string,
  harnesses: DetectedHarness[],
): HandoffPayload {
  const text =
    `Work on the OpenSpec change "${changeName}": run ` +
    `openspec status --change ${changeName} --json, then follow the ${verb} workflow.`;

  const configured = harnesses.find((harness) => harness.state === 'configured');
  const command = configured?.commands.find((entry) => entry.includes(verb));

  if (command !== undefined && configured !== undefined) {
    return {
      text,
      command: `${command} ${changeName}`,
      note: `${configured.label} has this workflow. Run the command in your session.`,
      delivery: 'clipboard',
    };
  }

  if (configured !== undefined) {
    return {
      text,
      note: `${configured.label} is set up for OpenSpec, but has no generated "${verb}" command. Paste this instead.`,
      delivery: 'clipboard',
    };
  }

  return {
    text,
    note: 'No AI tool is wired into OpenSpec in this project. Paste this into whichever agent you use.',
    delivery: 'clipboard',
  };
}

/**
 * The workflow that makes sense next, given what the change is missing.
 */
export function nextVerb(missingArtifacts: string[], tasksRemaining: number): string {
  if (missingArtifacts.length > 0) return 'propose';
  if (tasksRemaining > 0) return 'apply';
  return 'archive';
}
