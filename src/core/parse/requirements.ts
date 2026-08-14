import type { ParseIssue, Requirement, Scenario } from '../model/types.js';
import {
  bodyAfter,
  headingsWithin,
  slugify,
  type Heading,
  type ScannedDocument,
} from './markdown.js';

/**
 * Requirement and scenario extraction, shared by main specs and delta specs.
 *
 * OpenSpec requires `### Requirement: <name>` and `#### Scenario: <name>`, with
 * the scenario at exactly four hashes. Three hashes parse as another requirement
 * and the scenario vanishes without complaint, which is the single most common
 * authoring mistake in OpenSpec, so it is detected explicitly.
 */

const REQUIREMENT_PREFIX = /^Requirement:\s*(.*)$/i;
const SCENARIO_PREFIX = /^Scenario:\s*(.*)$/i;

export function isRequirementHeading(heading: Heading): boolean {
  return heading.level === 3 && REQUIREMENT_PREFIX.test(heading.text);
}

function requirementName(heading: Heading): string {
  return REQUIREMENT_PREFIX.exec(heading.text)?.[1]?.trim() ?? heading.text;
}

function scenarioName(heading: Heading): string {
  return SCENARIO_PREFIX.exec(heading.text)?.[1]?.trim() ?? heading.text;
}

/**
 * Strips scenario content from a requirement body, leaving the requirement text.
 */
function requirementTextOnly(
  doc: ScannedDocument,
  heading: Heading,
  scenarios: Scenario[],
): string {
  const firstScenarioLine = scenarios[0]?.line;
  const next = doc.headings.find((h) => h.line > heading.line && h.level <= heading.level);
  const end = firstScenarioLine ?? (next ? next.line : doc.lines.length + 1);
  return doc.lines
    .slice(heading.line, end - 1)
    .join('\n')
    .replace(/^\s*\n+/, '')
    .replace(/\s+$/, '');
}

/**
 * Parses every requirement under a section heading.
 *
 * @param section The heading whose subtree holds the requirements, or undefined
 *   to scan the whole document.
 */
export function parseRequirements(
  doc: ScannedDocument,
  section: Heading | undefined,
  path: string,
): { requirements: Requirement[]; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  const candidates = section
    ? headingsWithin(doc, section, 3)
    : doc.headings.filter((h) => h.level === 3);

  const requirementHeadings = candidates.filter(isRequirementHeading);

  // A level-3 heading that reads "Scenario: ..." is the four-hash mistake. It
  // would otherwise be silently dropped, taking its scenario with it.
  for (const heading of candidates) {
    if (SCENARIO_PREFIX.test(heading.text)) {
      issues.push({
        severity: 'error',
        message:
          `"${heading.text}" uses three hashes, but scenarios need exactly four. ` +
          'As written it will be ignored by OpenSpec.',
        path,
        line: heading.line,
      });
    }
  }

  const requirements: Requirement[] = requirementHeadings.map((heading) => {
    const scenarioHeadings = headingsWithin(doc, heading, 4);
    const scenarios: Scenario[] = scenarioHeadings.map((s) => ({
      name: scenarioName(s),
      body: bodyAfter(doc, s),
      line: s.line,
    }));

    if (scenarios.length === 0) {
      issues.push({
        severity: 'warning',
        message: `Requirement "${requirementName(heading)}" has no scenarios. OpenSpec requires at least one.`,
        path,
        line: heading.line,
      });
    }

    return {
      id: slugify(requirementName(heading)),
      name: requirementName(heading),
      text: requirementTextOnly(doc, heading, scenarios),
      scenarios,
      line: heading.line,
    };
  });

  return { requirements, issues };
}
