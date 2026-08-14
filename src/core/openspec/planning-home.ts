import { resolveCurrentPlanningHomeSync } from '@fission-ai/openspec';

import { joinPath } from '../fs/pathutil.js';
import type { PlanningHome } from '../model/types.js';
import { changesDir, mainSpecsDir, SPECS_DIR } from './paths.js';

/**
 * Resolving where a project's OpenSpec content actually lives.
 *
 * Assuming `openspec/` sits at the directory the user opened is wrong in two
 * real cases: a monorepo where it lives in a subpackage, and an OpenSpec
 * workspace where the changes directory is somewhere else entirely. OpenSpec
 * exports its own resolver, so specdeck delegates rather than guessing, which
 * means it resolves the same planning home the CLI would for the same folder.
 *
 * The resolver reads the real filesystem synchronously, so it is only consulted
 * for the local source. Any other source falls back to the conventional layout,
 * which is correct for every source specdeck can currently construct.
 */

interface ResolvedHome {
  kind?: unknown;
  root?: unknown;
  changesDir?: unknown;
  defaultSchema?: unknown;
  /** OpenSpec nests the workspace name, rather than exposing it at the top. */
  workspace?: { name?: unknown } | undefined;
}

const DEFAULT_SCHEMA = 'spec-driven';

/** The conventional layout, used when the resolver cannot be consulted. */
export function conventionalPlanningHome(projectRoot: string): PlanningHome {
  return {
    kind: 'repo',
    root: projectRoot,
    changesDir: changesDir(projectRoot),
    specsDir: mainSpecsDir(projectRoot),
    defaultSchema: DEFAULT_SCHEMA,
  };
}

/**
 * Asks OpenSpec where this project's planning home is.
 *
 * Returns undefined when the resolver cannot answer, which the caller treats as
 * a reason to fall back rather than as a failure.
 */
export function resolvePlanningHome(projectRoot: string): PlanningHome | undefined {
  let resolved: ResolvedHome | undefined;
  try {
    // The resolver takes an options object. Passing a bare path silently
    // resolves from the current working directory instead, which happens to
    // look correct whenever specdeck is run from inside the project and is
    // wrong the moment it is not.
    resolved = resolveCurrentPlanningHomeSync({
      startPath: projectRoot,
      allowImplicitRepoRoot: true,
    });
  } catch {
    return undefined;
  }

  if (resolved === undefined || typeof resolved.root !== 'string' || resolved.root === '') {
    return undefined;
  }

  const root = resolved.root;
  const changes =
    typeof resolved.changesDir === 'string' && resolved.changesDir !== ''
      ? resolved.changesDir
      : changesDir(root);

  // OpenSpec reports the changes directory but not the specs directory. For a
  // repo home they are siblings, so it is derived from the changes directory
  // rather than from the project root, which keeps a non-standard location
  // consistent across both.
  const specs = deriveSpecsDir(changes, root);

  const home: PlanningHome = {
    kind: resolved.kind === 'workspace' ? 'workspace' : 'repo',
    root,
    changesDir: changes,
    specsDir: specs,
    defaultSchema:
      typeof resolved.defaultSchema === 'string' && resolved.defaultSchema !== ''
        ? resolved.defaultSchema
        : DEFAULT_SCHEMA,
  };

  const workspaceName = resolved.workspace?.name;
  if (typeof workspaceName === 'string' && workspaceName !== '') {
    home.workspaceName = workspaceName;
  }

  return home;
}

/** `<parent-of-changes>/specs`, falling back to the conventional location. */
function deriveSpecsDir(changesDirectory: string, projectRoot: string): string {
  const normalized = changesDirectory.replace(/[\\/]+$/, '');
  const cut = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (cut <= 0) return mainSpecsDir(projectRoot);
  return joinPath(normalized.slice(0, cut), SPECS_DIR);
}
