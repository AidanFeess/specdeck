/**
 * Compatibility checking against the OpenSpec version actually in use.
 *
 * specdeck reads OpenSpec's on-disk markdown directly, because the package does
 * not export its parsers and the CLI's JSON coverage is incomplete. That makes
 * specdeck coupled to conventions OpenSpec can change in a minor release: the
 * artifact filenames, the delta operation headings, and the requirement and
 * scenario heading depths.
 *
 * When that coupling breaks, the visible symptom is a change that renders with
 * zero requirements. A version mismatch reported up front is far kinder than a
 * board that quietly shows nothing.
 */

/**
 * The highest OpenSpec minor version whose file conventions this build has been
 * verified against. Raise it deliberately, after checking the parsers, rather
 * than as a side effect of a dependency bump.
 */
export const MAX_VERIFIED_OPENSPEC = { major: 1, minor: 4 } as const;

/**
 * The lowest OpenSpec version that produces the layout specdeck expects.
 */
export const MIN_SUPPORTED_OPENSPEC = { major: 1, minor: 0 } as const;

export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
}

export type CompatibilityStatus =
  | 'supported'
  | 'newer-than-verified'
  | 'older-than-supported'
  | 'unreadable';

export interface CompatibilityResult {
  status: CompatibilityStatus;
  /** The parsed version, absent when the input could not be understood. */
  version?: SemanticVersion;
  /** A message written for a user reading it in the interface, not a log line. */
  message: string;
  /**
   * Whether specdeck should keep going. Only a version older than the supported
   * floor is treated as fatal, because that layout genuinely differs. A newer
   * version is a warning: it will usually work, and refusing to start would be
   * worse than rendering with a caveat.
   */
  usable: boolean;
}

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)/;

/**
 * Parses the leading `major.minor.patch` out of a version string, tolerating a
 * `v` prefix and any prerelease or build suffix.
 */
export function parseVersion(raw: string): SemanticVersion | undefined {
  const match = VERSION_PATTERN.exec(raw.trim());
  if (!match) return undefined;

  const [, majorText, minorText, patchText] = match;
  if (majorText === undefined || minorText === undefined || patchText === undefined) {
    return undefined;
  }

  const major = Number(majorText);
  const minor = Number(minorText);
  const patch = Number(patchText);
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) {
    return undefined;
  }

  return { major, minor, patch };
}

export function formatVersion(version: SemanticVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

/** Compares two versions by major and minor only, ignoring patch. */
function compareMinor(
  version: SemanticVersion,
  bound: { major: number; minor: number },
): -1 | 0 | 1 {
  if (version.major !== bound.major) return version.major < bound.major ? -1 : 1;
  if (version.minor !== bound.minor) return version.minor < bound.minor ? -1 : 1;
  return 0;
}

/**
 * Classifies an OpenSpec version against the range this build understands.
 */
export function checkOpenSpecCompatibility(rawVersion: string | undefined): CompatibilityResult {
  if (rawVersion === undefined || rawVersion.trim() === '') {
    return {
      status: 'unreadable',
      message:
        'Could not determine which version of OpenSpec is installed. specdeck will read your ' +
        'files anyway, but if changes appear empty, a version mismatch is the first thing to check.',
      usable: true,
    };
  }

  const version = parseVersion(rawVersion);
  if (!version) {
    return {
      status: 'unreadable',
      message:
        `Could not understand the OpenSpec version "${rawVersion}". specdeck will read your ` +
        'files anyway, but if changes appear empty, a version mismatch is the first thing to check.',
      usable: true,
    };
  }

  if (compareMinor(version, MIN_SUPPORTED_OPENSPEC) < 0) {
    return {
      status: 'older-than-supported',
      version,
      message:
        `This project uses OpenSpec ${formatVersion(version)}, which is older than the ` +
        `${MIN_SUPPORTED_OPENSPEC.major}.${MIN_SUPPORTED_OPENSPEC.minor} layout specdeck reads. ` +
        'Upgrade OpenSpec, or use an older specdeck.',
      usable: false,
    };
  }

  if (compareMinor(version, MAX_VERIFIED_OPENSPEC) > 0) {
    return {
      status: 'newer-than-verified',
      version,
      message:
        `This project uses OpenSpec ${formatVersion(version)}, which is newer than the ` +
        `${MAX_VERIFIED_OPENSPEC.major}.${MAX_VERIFIED_OPENSPEC.minor} release specdeck has been ` +
        'verified against. Everything will probably work. If a change shows no requirements, ' +
        'that is the likely cause, and it is worth reporting.',
      usable: true,
    };
  }

  return {
    status: 'supported',
    version,
    message: `OpenSpec ${formatVersion(version)} is supported.`,
    usable: true,
  };
}
