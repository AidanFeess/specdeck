/**
 * Minimal markdown scanning: lines, code fence masking, and ATX headings.
 *
 * Code fence masking is not optional. OpenSpec's own artifact instructions embed
 * fenced examples containing `### Requirement:` and `- [ ]`, so a scanner that
 * ignores fences will happily parse documentation as data.
 */

export interface Heading {
  /** Number of leading hashes. */
  level: number;
  /** Heading text with the hashes and surrounding whitespace stripped. */
  text: string;
  /** One-based line number. */
  line: number;
}

export interface ScannedDocument {
  /** Lines with line endings normalized, without terminators. */
  lines: string[];
  /** True at index i when line i+1 is inside a fenced code block. */
  fenced: boolean[];
  headings: Heading[];
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;
const ATX = /^(#{1,6})\s+(.*)$/;

export function splitLines(content: string): string[] {
  return content.replace(/\r\n?/g, '\n').split('\n');
}

/**
 * Marks lines that sit inside a fenced code block, fences included.
 *
 * Tracks the opening marker so a nested fence of a different length or character
 * does not close the block early.
 */
export function buildFenceMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let openMarker: string | undefined;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const match = FENCE.exec(line);

    if (openMarker === undefined) {
      if (match?.[1] !== undefined) {
        openMarker = match[1];
        mask[i] = true;
      }
      continue;
    }

    mask[i] = true;
    // A closing fence uses the same character and is at least as long, with
    // nothing after it.
    if (
      match?.[1] !== undefined &&
      match[1][0] === openMarker[0] &&
      match[1].length >= openMarker.length &&
      (match[2] ?? '').trim() === ''
    ) {
      openMarker = undefined;
    }
  }

  return mask;
}

export function scanDocument(content: string): ScannedDocument {
  const lines = splitLines(content);
  const fenced = buildFenceMask(lines);
  const headings: Heading[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (fenced[i]) continue;
    const match = ATX.exec(lines[i] ?? '');
    if (match?.[1] === undefined) continue;
    headings.push({
      level: match[1].length,
      text: (match[2] ?? '').trim(),
      line: i + 1,
    });
  }

  return { lines, fenced, headings };
}

/**
 * Returns the body between a heading and the next heading at the same level or
 * above, trimmed of blank edges.
 */
export function bodyAfter(doc: ScannedDocument, heading: Heading): string {
  const next = doc.headings.find((h) => h.line > heading.line && h.level <= heading.level);
  const end = next ? next.line - 1 : doc.lines.length;
  return doc.lines
    .slice(heading.line, end)
    .join('\n')
    .replace(/^\s*\n+/, '')
    .replace(/\s+$/, '');
}

/** Headings strictly inside a section, before the next heading at or above its level. */
export function headingsWithin(doc: ScannedDocument, heading: Heading, level: number): Heading[] {
  const next = doc.headings.find((h) => h.line > heading.line && h.level <= heading.level);
  const end = next ? next.line : Number.MAX_SAFE_INTEGER;
  return doc.headings.filter((h) => h.line > heading.line && h.line < end && h.level === level);
}

/** Extracts a `**Label**: value` field from a block of text. */
export function labelledField(body: string, label: string): string | undefined {
  const pattern = new RegExp(`^\\s*\\*\\*${label}\\*\\*\\s*:?\\s*(.+)$`, 'im');
  const match = pattern.exec(body);
  return match?.[1]?.trim();
}

/** Slugifies a heading into a stable within-file identifier. */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unnamed'
  );
}
