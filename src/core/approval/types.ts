/**
 * Approval.
 *
 * The first thing specdeck records rather than only reads, and the design that
 * keeps it honest is that it still records nothing of its own: approving writes
 * a commit, and the state below is read back out of git every time it is asked
 * for. There is no approval field anywhere, which is why approval survives a
 * clone, appears for a teammate the moment they pull, and cannot drift out of
 * agreement with the repository.
 */

export type ApprovalState =
  /** A matching commit exists and the artifacts still match it. */
  | 'approved'
  /** A matching commit exists and something has changed since. */
  | 'needs-review'
  /** No approval has ever been recorded for this change. */
  | 'never-approved'
  /**
   * Approval could not be determined.
   *
   * Deliberately distinct from `never-approved`. Showing an unreadable state as
   * unapproved would be inventing a fact, and the interface renders nothing at
   * all for this case rather than an indicator that happens to be wrong.
   */
  | 'unknown';

export interface Approver {
  name: string;
  email: string;
}

export interface ApprovalRecord {
  /** Full hash of the approving commit. */
  commit: string;
  approver: Approver;
  /** Author date of the approving commit, ISO 8601. */
  approvedAt: string;
}

export interface Approval {
  state: ApprovalState;
  /** Why the state is unknown. Present only for `unknown`. */
  reason?: string;
  /** The most recent approval. Absent when never approved. */
  latest?: ApprovalRecord;
  /**
   * Paths that differ from the approving commit, repository-relative.
   *
   * Populated for `needs-review` so the interface can say what moved rather than
   * only that something did.
   */
  drift?: string[];
}

/** Scopes an approval to one change. This is what makes a commit an approval. */
export const CHANGE_TRAILER = 'Approved-change';

/** Names the approver, for display. */
export const APPROVER_TRAILER = 'Approved-by';

/**
 * Reads a trailer from a commit message body.
 *
 * The last occurrence wins, matching how git itself resolves a repeated trailer.
 */
export function readTrailer(body: string, key: string): string | undefined {
  let found: string | undefined;
  for (const line of body.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z-]*):[ \t]*(.*)$/.exec(line.trim());
    if (match !== null && match[1]?.toLowerCase() === key.toLowerCase()) found = match[2]?.trim();
  }
  return found === '' ? undefined : found;
}
