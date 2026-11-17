import type {
  Capability,
  DeltaSpec,
  DeltaRequirement,
  Requirement,
  Scenario,
} from '../model/types.js';
import { slugify } from '../parse/markdown.js';

export interface ScenarioComparison {
  name: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  before?: Scenario;
  after?: Scenario;
}

export interface RequirementComparison {
  operation: DeltaRequirement['operation'];
  name: string;
  before?: Requirement;
  after?: Requirement;
  scenarios: ScenarioComparison[];
}

export interface CapabilityReview {
  capability: string;
  comparisons: RequirementComparison[];
  issues: string[];
  /** Absent whenever the comparison cannot be applied reliably. */
  preview?: Requirement[];
}

const key = (name: string): string => name.trim().replace(/\s+/g, ' ');
const body = (text: string): string => text.replace(/\r\n?/g, '\n').trim();

export function compareScenarios(before: Scenario[], after: Scenario[]): ScenarioComparison[] {
  const names = new Set([...before, ...after].map((s) => key(s.name)));
  return [...names].map((name) => {
    const old = before.find((s) => key(s.name) === name);
    const next = after.find((s) => key(s.name) === name);
    return {
      name,
      status: !old
        ? 'added'
        : !next
          ? 'removed'
          : body(old.body) === body(next.body)
            ? 'unchanged'
            : 'modified',
      ...(old ? { before: old } : {}),
      ...(next ? { after: next } : {}),
    };
  });
}

function duplicates(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map(key).filter((name) => {
    if (seen.has(name)) return true;
    seen.add(name);
    return false;
  });
}

/** A structural preview, not a claim that the requirement is correct or tested. */
export function compareCapability(
  current: Capability | undefined,
  delta: DeltaSpec,
): CapabilityReview {
  const issues = [...(current?.issues ?? []), ...delta.issues]
    .filter((issue) => issue.severity === 'error')
    .map((issue) => issue.message);
  const original = current?.requirements ?? [];
  for (const name of duplicates(original.map((r) => r.name)))
    issues.push(`Duplicate current requirement: ${name}.`);
  for (const req of [...original, ...delta.requirements]) {
    for (const name of duplicates(req.scenarios.map((s) => s.name)))
      issues.push(`Duplicate scenario in "${req.name}": ${name}.`);
  }
  for (const operation of ['added', 'modified', 'removed', 'renamed'] as const) {
    for (const name of duplicates(
      delta.requirements
        .filter((r) => r.operation === operation)
        .map((r) => r.renamedFrom ?? r.name),
    )) {
      issues.push(`Duplicate ${operation} operation: ${name}.`);
    }
  }
  if (!delta.requirements.length) issues.push('No requirement operations could be read.');
  const result = new Map(original.map((r) => [key(r.name), r]));
  const comparisons: RequirementComparison[] = [];
  // OpenSpec applies renames before removals, modifications, and additions.
  const order = { renamed: 0, removed: 1, modified: 2, added: 3 };
  const operations = [...delta.requirements].sort(
    (a, b) => order[a.operation] - order[b.operation],
  );
  const edited = new Set<string>();
  for (const req of operations) {
    const name = key(req.operation === 'renamed' ? (req.renamedFrom ?? req.name) : req.name);
    const before = result.get(name);
    let after: Requirement | undefined;
    if (req.operation === 'added') {
      if (before)
        issues.push(`Cannot add "${name}": it already exists. It may have been synced already.`);
      after = req;
    } else if (!before) {
      issues.push(
        `Cannot ${req.operation === 'renamed' ? 'rename' : req.operation === 'removed' ? 'remove' : 'modify'} "${name}": no current requirement matches.`,
      );
      if (req.operation === 'modified') after = req;
    } else if (req.operation === 'renamed') {
      const target = req.renamedTo ? key(req.renamedTo) : '';
      if (!target || target === name || result.has(target))
        issues.push(
          `Cannot rename "${name}": the destination is missing, unchanged, or already exists.`,
        );
      else {
        after = { ...before, name: req.renamedTo!, id: slugify(req.renamedTo!) };
        result.delete(name);
        result.set(target, after);
      }
    } else if (req.operation === 'modified') after = req;

    if (req.operation !== 'renamed') {
      if (edited.has(name)) issues.push(`Multiple operations target "${name}".`);
      edited.add(name);
      if (after) result.set(name, after);
      else if (req.operation === 'removed') result.delete(name);
    }
    comparisons.push({
      operation: req.operation,
      name: req.name,
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
      scenarios: compareScenarios(before?.scenarios ?? [], after?.scenarios ?? []),
    });
  }
  return {
    capability: delta.capability,
    comparisons,
    issues,
    ...(issues.length ? {} : { preview: [...result.values()] }),
  };
}
