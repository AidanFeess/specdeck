import { parseJsonOutput, runOpenspec } from './run.js';

/**
 * Workspaces, context stores, and initiatives.
 *
 * OpenSpec 1.4 grew a cross-repository model, and specdeck consumes it rather
 * than inventing a parallel one. Everything here comes from OpenSpec's own
 * listing and diagnostic commands: which workspaces and stores exist is
 * OpenSpec's answer to give, and specdeck only decides which of them to show.
 *
 * Nothing here creates, modifies, or removes a registration. Adding a root to
 * specdeck's own registry is a specdeck concern; OpenSpec's registry is read.
 *
 * Every function is a process spawn, so none of this belongs on the state
 * payload that rebuilds on every filesystem event. It is fetched on demand and
 * carries the time it was computed, so the interface can show the age rather
 * than imply the answer is current.
 */

/** A finding from an OpenSpec diagnostic, in OpenSpec's own shape. */
export interface Diagnostic {
  severity: string;
  code?: string;
  message: string;
  target?: string;
  /** A command that would resolve it, when OpenSpec offers one. */
  fix?: string;
}

/**
 * Health of a root.
 *
 * `unknown` is not a synonym for healthy. A diagnostic that could not run has
 * told us nothing, and the interface renders nothing rather than a reassuring
 * badge it has not earned.
 */
export type Health = 'ok' | 'problem' | 'unknown';

export interface WorkspaceLink {
  name: string;
  path: string;
  status: Diagnostic[];
}

export interface Workspace {
  name: string;
  root: string;
  links: WorkspaceLink[];
  status: Diagnostic[];
  health: Health;
}

export interface ContextStore {
  id: string;
  root: string;
  status: Diagnostic[];
  health: Health;
}

export interface Initiative {
  id: string;
  /** The context store the initiative lives in. */
  store: string;
  title?: string;
}

export interface StoreSnapshot {
  workspaces: Workspace[];
  worksets: Array<{ name: string; members: Array<{ name: string; path: string }> }>;
  contextStores: ContextStore[];
  initiatives: Initiative[];
  /** Why a section is empty, when it is empty because something failed. */
  problems: string[];
  /** When this was computed, so the interface can show its age. */
  checkedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function readDiagnostics(value: unknown): Diagnostic[] {
  if (!Array.isArray(value)) return [];

  const found: Diagnostic[] = [];
  for (const raw of value) {
    const entry = asRecord(raw);
    if (entry === undefined) continue;
    const message = asString(entry.message);
    if (message === undefined) continue;

    const diagnostic: Diagnostic = {
      severity: asString(entry.severity) ?? 'error',
      message,
    };
    const code = asString(entry.code);
    const target = asString(entry.target);
    const fix = asString(entry.fix);
    if (code !== undefined) diagnostic.code = code;
    if (target !== undefined) diagnostic.target = target;
    if (fix !== undefined) diagnostic.fix = fix;
    found.push(diagnostic);
  }
  return found;
}

/** Health from a diagnostic that ran. Anything not a warning counts as a problem. */
function healthOf(status: Diagnostic[]): Health {
  if (status.length === 0) return 'ok';
  return 'problem';
}

async function readJson<T>(
  projectRoot: string,
  args: string[],
): Promise<{ value?: T; problem?: string }> {
  const result = await runOpenspec(projectRoot, args);
  // The JSON is on stdout; stderr carries notices that are not failures.
  const value = parseJsonOutput<T>(result.stdout) ?? parseJsonOutput<T>(result.output);

  if (value === undefined) {
    return {
      problem:
        result.failure === 'missing-openspec'
          ? (result.message ?? 'specdeck could not find its bundled copy of OpenSpec.')
          : `\`${result.command}\` did not return a result specdeck could read.`,
    };
  }
  return { value };
}

/** Read-only adapters for OpenSpec 2 stores and personal worksets. */
export async function readStores(
  projectRoot: string,
  now: () => Date = () => new Date(),
): Promise<StoreSnapshot> {
  const [listed, diagnosed, views] = await Promise.all([
    readJson<{ stores?: unknown; status?: unknown }>(projectRoot, ['store', 'list', '--json']),
    readJson<{ stores?: unknown; status?: unknown }>(projectRoot, ['store', 'doctor', '--json']),
    readJson<{ worksets?: unknown; status?: unknown }>(projectRoot, ['workset', 'list', '--json']),
  ]);
  const problems: string[] = [];
  for (const outcome of [listed, diagnosed, views]) {
    if (outcome.problem) problems.push(outcome.problem);
    for (const diagnostic of readDiagnostics(outcome.value?.status))
      problems.push(diagnostic.message);
  }
  const contextStores: ContextStore[] = [];
  const checks = Array.isArray(diagnosed.value?.stores) ? diagnosed.value.stores : [];
  if (Array.isArray(listed.value?.stores)) {
    for (const raw of listed.value.stores) {
      const entry = asRecord(raw);
      const id = asString(entry?.id);
      const root = asString(entry?.root);
      if (!id || !root) continue;
      const check = asRecord(checks.find((c) => asRecord(c)?.id === id));
      const status = [
        ...readDiagnostics(check?.status),
        ...readDiagnostics(asRecord(check?.openspec_root)?.status),
      ];
      contextStores.push({
        id,
        root,
        status,
        health: check && Array.isArray(check.status) ? healthOf(status) : 'unknown',
      });
    }
  }
  const worksets: Array<{ name: string; members: Array<{ name: string; path: string }> }> = [];
  if (Array.isArray(views.value?.worksets)) {
    for (const raw of views.value.worksets) {
      const view = asRecord(raw);
      const name = asString(view?.name);
      if (!name || !Array.isArray(view?.members)) continue;
      const members: Array<{ name: string; path: string }> = [];
      for (const rawMember of view.members) {
        const member = asRecord(rawMember);
        const memberName = asString(member?.name);
        const path = asString(member?.path);
        if (memberName && path) members.push({ name: memberName, path });
      }
      worksets.push({ name, members });
    }
  }
  return {
    workspaces: [],
    contextStores,
    worksets,
    initiatives: [],
    problems,
    checkedAt: now().toISOString(),
  };
}
