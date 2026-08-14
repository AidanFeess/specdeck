/**
 * The read model.
 *
 * Every type here describes something specdeck reads from disk. Nothing here is
 * ever written back except task checkbox state, and nothing here carries a
 * status that specdeck invented. If a field looks like it is tracking progress,
 * it was computed from files, and recomputing it from the same files must
 * produce the same answer.
 *
 * That invariant is what lets the board be trustworthy: it can never disagree
 * with the repository, because it has no memory of its own to disagree from.
 */

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

/**
 * Board lanes, in display order.
 *
 * These are derived, never stored. There is deliberately no lane before `draft`:
 * a pre-proposal "ideas" lane would require inventing a file format OpenSpec
 * does not define, and writing into a directory OpenSpec does not own.
 */
export const LANES = [
  'draft',
  'proposed',
  'specified',
  'ready',
  'in-progress',
  'done',
  'archived',
] as const;

export type Lane = (typeof LANES)[number];

export const LANE_LABELS: Readonly<Record<Lane, string>> = {
  draft: 'Draft',
  proposed: 'Proposed',
  specified: 'Specified',
  ready: 'Ready',
  'in-progress': 'In Progress',
  done: 'Done',
  archived: 'Archived',
};

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type IssueSeverity = 'error' | 'warning';

/**
 * A problem found while reading a file.
 *
 * These are attached to the item they concern rather than thrown, because one
 * malformed change must never blank the board. A change that cannot be parsed
 * is shown in an error state next to every change that parsed fine.
 */
export interface ParseIssue {
  severity: IssueSeverity;
  /** Written for a user reading it in the interface, not for a log. */
  message: string;
  /** Absolute path of the file the issue was found in. */
  path: string;
  /** One-based line number, when the issue can be located precisely. */
  line?: number;
}

// ---------------------------------------------------------------------------
// Requirements and scenarios
// ---------------------------------------------------------------------------

/**
 * A single scenario under a requirement.
 *
 * OpenSpec requires exactly four hashes for the scenario heading. Three hashes
 * parse as a requirement instead and the scenario silently disappears, which is
 * why malformed depth is captured as an issue rather than ignored.
 */
export interface Scenario {
  name: string;
  /** The scenario body as authored, preserving its WHEN and THEN lines. */
  body: string;
  /** One-based line of the scenario heading in its source file. */
  line: number;
}

export interface Requirement {
  /** Slug derived from the requirement name. Stable for linking within a file. */
  id: string;
  name: string;
  /** The requirement text, excluding its scenarios. */
  text: string;
  scenarios: Scenario[];
  /** One-based line of the requirement heading in its source file. */
  line: number;
}

// ---------------------------------------------------------------------------
// Capabilities (the accumulated specs)
// ---------------------------------------------------------------------------

/**
 * A capability in `openspec/specs/<id>/spec.md`, the accumulated truth that
 * archived changes have merged into.
 */
export interface Capability {
  /** Kebab-case directory name, which is the capability's identity. */
  id: string;
  /** Absolute path to the capability's spec file. */
  path: string;
  title: string;
  /** Content of the Purpose section, when present. */
  purpose?: string;
  requirements: Requirement[];
  issues: ParseIssue[];
}

// ---------------------------------------------------------------------------
// Delta specs (a change's proposed edits to capabilities)
// ---------------------------------------------------------------------------

export const DELTA_OPERATIONS = ['added', 'modified', 'removed', 'renamed'] as const;
export type DeltaOperationKind = (typeof DELTA_OPERATIONS)[number];

/**
 * A requirement as it appears inside a change's delta spec, carrying the fields
 * that only exist in a delta context.
 */
export interface DeltaRequirement extends Requirement {
  operation: DeltaOperationKind;
  /** Required by OpenSpec for removed requirements. */
  reason?: string;
  /** Required by OpenSpec for removed requirements. */
  migration?: string;
  /** Present for renamed requirements. */
  renamedFrom?: string;
  renamedTo?: string;
}

/**
 * One capability's delta within a change, read from
 * `changes/<name>/specs/<capability>/spec.md`.
 */
export interface DeltaSpec {
  /** The capability this delta targets. May not exist in main specs yet. */
  capability: string;
  path: string;
  requirements: DeltaRequirement[];
  issues: ParseIssue[];
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/**
 * A single checkbox in `tasks.md`.
 *
 * `line` is load-bearing rather than informational: toggling a checkbox rewrites
 * that exact line, and the write is verified against the line's current content
 * so a concurrent agent edit cannot be silently clobbered.
 */
export interface Task {
  /** The numeric label as authored, for example "1.1". Absent if unnumbered. */
  id?: string;
  text: string;
  completed: boolean;
  /** One-based line number in tasks.md. */
  line: number;
}

export interface TaskGroup {
  /** The heading number as authored, for example "1". Absent if unnumbered. */
  number?: string;
  title: string;
  tasks: Task[];
  line: number;
}

export interface TaskList {
  groups: TaskGroup[];
  completed: number;
  total: number;
  issues: ParseIssue[];
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

/**
 * Artifact readiness, mirroring what `openspec status` reports.
 *
 * `done` means only that the file exists. OpenSpec has no notion of an artifact
 * being written badly, and specdeck does not invent one.
 */
export type ArtifactStatus = 'done' | 'ready' | 'blocked';

/**
 * One artifact of a change, as declared by the change's workflow schema.
 *
 * Artifact identities come from the schema rather than being hardcoded, because
 * a project may use a schema whose artifacts are not proposal, specs, design,
 * and tasks.
 */
export interface Artifact {
  id: string;
  /** The output path or glob the schema declares, relative to the change root. */
  outputPath: string;
  status: ArtifactStatus;
  /** Absolute paths that currently satisfy this artifact. Empty when not done. */
  existingPaths: string[];
  /** Artifact ids this one waits on. Populated when status is `blocked`. */
  missingDeps: string[];
}

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

export type ChangeLocation = 'active' | 'archived';

/** Contents of a change's `.openspec.yaml`. */
export interface ChangeMetadata {
  schema: string;
  /** Date only, as OpenSpec writes it. Not a timestamp. */
  created?: string;
  goal?: string;
  affectedAreas?: string[];
  initiative?: { store: string; id: string };
}

export interface Change {
  /** Directory name for active changes, with the date prefix stripped for archived ones. */
  name: string;
  /** Absolute path to the change directory. */
  dir: string;
  location: ChangeLocation;
  /** Date prefix parsed from an archived directory name, for example "2026-08-14". */
  archivedOn?: string;
  metadata: ChangeMetadata;
  artifacts: Artifact[];
  deltaSpecs: DeltaSpec[];
  tasks: TaskList;
  /** Derived from artifacts, tasks, and location. Never read from a file. */
  lane: Lane;
  /**
   * Capability ids this change touches, taken from its delta specs. A capability
   * named here may not exist in main specs yet, which is normal for a change
   * that introduces it.
   */
  capabilities: string[];
  issues: ParseIssue[];
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type PlanningHomeKind = 'repo' | 'workspace';

/** Where a project's OpenSpec content lives, as OpenSpec itself resolves it. */
export interface PlanningHome {
  kind: PlanningHomeKind;
  /** Absolute path to the project root. */
  root: string;
  /** Absolute path to the changes directory. */
  changesDir: string;
  /** Absolute path to the main specs directory. */
  specsDir: string;
  defaultSchema: string;
  workspaceName?: string;
}

/**
 * Why a project could not be read.
 *
 * These are distinct states rather than one error string because each one has a
 * different remedy that the interface offers directly.
 */
export type ProjectProblem =
  | 'path-missing'
  | 'not-openspec'
  | 'planning-home-unresolved'
  | 'openspec-version-unsupported'
  | 'read-failed';

export interface ProjectSnapshot {
  /** Stable identifier derived from the project path. */
  id: string;
  /** Absolute path the user registered. */
  path: string;
  /** Display name, defaulting to the directory name. */
  name: string;
  planningHome: PlanningHome;
  changes: Change[];
  capabilities: Capability[];
  issues: ParseIssue[];
  /** When this snapshot was computed, for the visible scan age. */
  scannedAt: string;
}

/**
 * A project that could not be read into a snapshot.
 *
 * Kept as a first-class result rather than an exception so the registry can list
 * a broken project alongside working ones instead of failing to load at all.
 */
export interface ProjectFailure {
  id: string;
  path: string;
  name: string;
  problem: ProjectProblem;
  /** Written for a user reading it in the interface. */
  message: string;
}

export type ProjectResult =
  { ok: true; snapshot: ProjectSnapshot } | { ok: false; failure: ProjectFailure };
