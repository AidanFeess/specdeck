import type { Capability, ParseIssue } from '../model/types.js';
import { bodyAfter, scanDocument } from './markdown.js';
import { parseRequirements } from './requirements.js';

/**
 * Parses a main capability spec from `openspec/specs/<id>/spec.md`.
 *
 * Requirements are looked for under a `## Requirements` section, falling back to
 * a whole-document scan. The fallback matters because hand-written specs
 * frequently omit the wrapper section, and dropping their requirements would
 * make a populated capability look empty.
 */
export function parseCapability(id: string, path: string, content: string): Capability {
  const doc = scanDocument(content);
  const issues: ParseIssue[] = [];

  const titleHeading = doc.headings.find((h) => h.level === 1);
  const title = titleHeading?.text.replace(/\s+Specification$/i, '').trim() ?? id;

  const purposeHeading = doc.headings.find(
    (h) => h.level === 2 && /^(purpose|overview)$/i.test(h.text),
  );
  const purpose = purposeHeading ? bodyAfter(doc, purposeHeading) : undefined;

  const requirementsHeading = doc.headings.find(
    (h) => h.level === 2 && /^requirements$/i.test(h.text),
  );

  const parsed = parseRequirements(doc, requirementsHeading, path);
  issues.push(...parsed.issues);

  if (parsed.requirements.length === 0) {
    issues.push({
      severity: 'warning',
      message:
        'This capability has no requirements. Either it is a placeholder, or its headings do not ' +
        'use the "### Requirement:" form OpenSpec expects.',
      path,
    });
  }

  const capability: Capability = {
    id,
    path,
    title: title === '' ? id : title,
    requirements: parsed.requirements,
    issues,
  };
  if (purpose !== undefined && purpose !== '') capability.purpose = purpose;
  return capability;
}
