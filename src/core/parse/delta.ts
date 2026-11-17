import type {
  DeltaOperationKind,
  DeltaRequirement,
  DeltaSpec,
  ParseIssue,
} from '../model/types.js';
import { labelledField, scanDocument, slugify, type Heading } from './markdown.js';
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
    if (operation === 'renamed') {
      const end =
        doc.headings.find((h) => h.line > heading.line && h.level <= 2)?.line ??
        doc.lines.length + 1;
      let from: { name: string; line: number } | undefined;
      for (let i = heading.line; i < end - 1; i++) {
        if (doc.fenced[i]) continue;
        const match = /^\s*(?:[-*+]\s*)?(?:\*\*)?(FROM|TO)(?:\*\*)?:\s*(.+)$/i.exec(
          doc.lines[i] ?? '',
        );
        if (!match) continue;
        const name = stripQuotes(match[2] ?? '')
          .replace(/^###\s+Requirement:\s*/i, '')
          .trim();
        if (match[1]?.toUpperCase() === 'FROM') {
          if (from)
            issues.push({
              severity: 'error',
              message: `Rename "${from.name}" is missing TO.`,
              path,
              line: from.line,
            });
          from = { name, line: i + 1 };
        } else if (from && name) {
          requirements.push({
            id: slugify(name),
            name,
            text: '',
            scenarios: [],
            line: from.line,
            operation,
            renamedFrom: from.name,
            renamedTo: name,
          });
          from = undefined;
        } else {
          issues.push({
            severity: 'error',
            message: 'Rename TO has no preceding FROM.',
            path,
            line: i + 1,
          });
        }
      }
      if (from)
        issues.push({
          severity: 'error',
          message: `Rename "${from.name}" is missing TO.`,
          path,
          line: from.line,
        });
      continue;
    }
    const parsed = parseRequirements(doc, heading, path);
    issues.push(
      ...parsed.issues.filter(
        (issue) => operation !== 'removed' || !issue.message.includes('has no scenarios.'),
      ),
    );
    const end =
      doc.headings.find((h) => h.line > heading.line && h.level <= 2)?.line ?? doc.lines.length + 1;
    if (operation === 'removed') {
      for (let i = heading.line; i < end - 1; i++) {
        if (doc.fenced[i]) continue;
        const match = /^\s*[-*+]\s*`?###\s*Requirement:\s*(.+?)`?\s*$/.exec(doc.lines[i] ?? '');
        if (match?.[1]) {
          const name = stripQuotes(match[1]);
          parsed.requirements.push({
            id: slugify(name),
            name,
            text: '',
            scenarios: [],
            line: i + 1,
          });
        }
      }
    }
    for (const h of doc.headings.filter(
      (h) => h.line > heading.line && h.line < end && h.level === 3,
    )) {
      if (!/^Requirement:/i.test(h.text))
        issues.push({
          severity: 'error',
          message: `Unrecognized requirement heading: ${h.text}.`,
          path,
          line: h.line,
        });
    }

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

      requirements.push(delta);
    }
  }

  return { capability, path, requirements, issues };
}

/** Removes wrapping backticks or quotes OpenSpec examples use around names. */
function stripQuotes(value: string): string {
  return value.replace(/^[`'"]+|[`'"]+$/g, '').trim();
}
