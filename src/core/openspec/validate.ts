import { parseJsonOutput, runOpenspec } from './run.js';

/**
 * Running OpenSpec's own validation.
 *
 * specdeck already reports problems it found while parsing. This is a different
 * question with a different authority behind it: OpenSpec deciding whether a
 * change is valid by its own rules. The two are kept apart in the interface,
 * because "specdeck could not parse this" and "OpenSpec rejects this" lead to
 * different fixes.
 *
 * A validation that cannot run reports that it could not run. It never reports
 * valid, because an unanswered question is not a pass.
 */

export interface ValidationIssue {
  message: string;
  /** OpenSpec's own severity when it gives one. */
  level?: string;
  /** Where the issue was found, when OpenSpec says. */
  path?: string;
}

export interface ValidationResult {
  changeName: string;
  /** False when validation could not be run at all. */
  available: boolean;
  /** Why it could not run. Present only when unavailable. */
  reason?: string;
  /** Undefined when unavailable. Never defaulted to true. */
  valid?: boolean;
  issues: ValidationIssue[];
  /** The command that ran, for copying. */
  command: string;
  /** Its output, shown when validation could not be read. */
  output: string;
  /** When this ran, so the interface can show the age rather than imply now. */
  checkedAt: string;
}

interface RawItem {
  id?: unknown;
  valid?: unknown;
  issues?: unknown;
}

function toIssue(raw: unknown): ValidationIssue {
  if (typeof raw === 'string') return { message: raw };
  if (typeof raw !== 'object' || raw === null) return { message: JSON.stringify(raw) };

  const entry = raw as { message?: unknown; level?: unknown; path?: unknown };
  const issue: ValidationIssue = {
    message: typeof entry.message === 'string' ? entry.message : JSON.stringify(raw),
  };
  if (typeof entry.level === 'string') issue.level = entry.level;
  if (typeof entry.path === 'string') issue.path = entry.path;
  return issue;
}

export async function validateChange(
  projectRoot: string,
  changeName: string,
  now: () => Date = () => new Date(),
): Promise<ValidationResult> {
  const result = await runOpenspec(projectRoot, ['validate', changeName, '--json']);
  const checkedAt = now().toISOString();

  const parsed = parseJsonOutput<{ items?: RawItem[] }>(result.output);

  // A non-zero exit is normal here: `validate` fails when the change is
  // invalid, and the JSON it printed is exactly what we want. Only the absence
  // of readable JSON means validation did not actually happen.
  if (parsed?.items === undefined) {
    const unavailable: ValidationResult = {
      changeName,
      available: false,
      reason:
        result.failure === 'missing-openspec'
          ? (result.message ?? 'specdeck could not find its bundled copy of OpenSpec.')
          : 'OpenSpec did not return a validation result that specdeck could read.',
      issues: [],
      command: result.command,
      output: result.output,
      checkedAt,
    };
    return unavailable;
  }

  const item = parsed.items.find((entry) => entry.id === changeName) ?? parsed.items[0];
  const issues = Array.isArray(item?.issues) ? item.issues.map(toIssue) : [];

  return {
    changeName,
    available: true,
    valid: item?.valid === true,
    issues,
    command: result.command,
    output: result.output,
    checkedAt,
  };
}
