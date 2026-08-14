import type {
  DeltaOperationKind,
  DeltaRequirement,
  DeltaSpec,
  ParseIssue,
} from '../model/types.js';
import { labelledField, scanDocument, type Heading } from './markdown.js';
import { parseRequirements } from './requirements.js';

/**
 * Parses a change's delta spec from `changes/<name>/specs/<capability>/spec.md`.
 *
 * Delta operations are declared as level-2 headings: `## ADDED Requirements`,
 * `## MODIFIED Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements`.
 */

const OPERATION_HEADING = /^(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements?$/i;

function operationOf(heading: Heading): DeltaOperationKind | undefined {
  const match = OPERATION_HEADING.exec(heading.text);
  const word = match?.[1]?.toLowerCase();
  switch (word) {
    case 'added':
      return 'added';
    case 'modified':
      return 'modified';
    case 'removed':
      return 'removed';
    case 'renamed':
      return 'renamed';
    default:
      return undefined;
  }
}

export function parseDeltaSpec(capability: string, path: string, content: string): DeltaSpec {
  const doc = scanDocument(content);
  const issues: ParseIssue[] = [];
  const requirements: DeltaRequirement[] = [];

  const operationHeadings = doc.headings
    .filter((h) => h.level === 2)
    .map((heading) => ({ heading, operation: operationOf(heading) }))
    .filter(
      (entry): entry is { heading: Heading; operation: DeltaOperationKind } =>
        entry.operation !== undefined,
    );

  if (operationHeadings.length === 0) {
    issues.push({
      severity: 'error',
      message:
        'This delta spec declares no operation sections. It needs at least one of ' +
        '"## ADDED Requirements", "## MODIFIED Requirements", "## REMOVED Requirements", ' +
        'or "## RENAMED Requirements".',
      path,
    });
  }

  for (const { heading, operation } of operationHeadings) {
    const parsed = parseRequirements(doc, heading, path);
    issues.push(...parsed.issues);

    for (const requirement of parsed.requirements) {
      const delta: DeltaRequirement = { ...requirement, operation };

      if (operation === 'removed') {
        const reason = labelledField(requirement.text, 'Reason');
        const migration = labelledField(requirement.text, 'Migration');
        if (reason !== undefined) delta.reason = reason;
        if (migration !== undefined) delta.migration = migration;
        if (reason === undefined || migration === undefined) {
          issues.push({
            severity: 'warning',
            message:
              `Removed requirement "${requirement.name}" is missing a ` +
              `${reason === undefined ? 'Reason' : 'Migration'} field, which OpenSpec requires.`,
            path,
            line: requirement.line,
          });
        }
      }

      if (operation === 'renamed') {
        const from = labelledField(requirement.text, 'FROM');
        const to = labelledField(requirement.text, 'TO');
        if (from !== undefined) delta.renamedFrom = stripQuotes(from);
        if (to !== undefined) delta.renamedTo = stripQuotes(to);
        if (from === undefined || to === undefined) {
          issues.push({
            severity: 'warning',
            message:
              `Renamed requirement "${requirement.name}" is missing a ` +
              `${from === undefined ? 'FROM' : 'TO'} field.`,
            path,
            line: requirement.line,
          });
        }
      }

      requirements.push(delta);
    }
  }

  return { capability, path, requirements, issues };
}

/** Removes wrapping backticks or quotes OpenSpec examples use around names. */
function stripQuotes(value: string): string {
  return value.replace(/^[`'"]+|[`'"]+$/g, '').trim();
}
