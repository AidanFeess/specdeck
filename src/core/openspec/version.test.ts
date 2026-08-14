import { describe, expect, it } from 'vitest';

import {
  MAX_VERIFIED_OPENSPEC,
  checkOpenSpecCompatibility,
  formatVersion,
  parseVersion,
} from './version.js';

describe('parseVersion', () => {
  it('parses a plain version', () => {
    expect(parseVersion('1.4.1')).toEqual({ major: 1, minor: 4, patch: 1 });
  });

  it('tolerates a leading v and surrounding whitespace', () => {
    expect(parseVersion('  v2.10.3 ')).toEqual({ major: 2, minor: 10, patch: 3 });
  });

  it('ignores prerelease and build suffixes', () => {
    expect(parseVersion('1.5.0-beta.2+build9')).toEqual({ major: 1, minor: 5, patch: 0 });
  });

  it('returns undefined for input it cannot understand', () => {
    expect(parseVersion('')).toBeUndefined();
    expect(parseVersion('next')).toBeUndefined();
    expect(parseVersion('1.4')).toBeUndefined();
  });
});

describe('formatVersion', () => {
  it('renders major, minor, and patch', () => {
    expect(formatVersion({ major: 1, minor: 4, patch: 1 })).toBe('1.4.1');
  });
});

describe('checkOpenSpecCompatibility', () => {
  it('accepts the version this build is verified against', () => {
    const result = checkOpenSpecCompatibility(
      `${MAX_VERIFIED_OPENSPEC.major}.${MAX_VERIFIED_OPENSPEC.minor}.0`,
    );
    expect(result.status).toBe('supported');
    expect(result.usable).toBe(true);
  });

  it('accepts any patch release within the verified minor', () => {
    const result = checkOpenSpecCompatibility(
      `${MAX_VERIFIED_OPENSPEC.major}.${MAX_VERIFIED_OPENSPEC.minor}.99`,
    );
    expect(result.status).toBe('supported');
  });

  it('warns but keeps running when OpenSpec is newer than verified', () => {
    const result = checkOpenSpecCompatibility(
      `${MAX_VERIFIED_OPENSPEC.major}.${MAX_VERIFIED_OPENSPEC.minor + 1}.0`,
    );
    expect(result.status).toBe('newer-than-verified');
    // A newer OpenSpec usually works. Refusing to start would be worse than
    // rendering with a caveat, so this must stay usable.
    expect(result.usable).toBe(true);
    expect(result.message).toContain('newer');
  });

  it('warns on a newer major version', () => {
    const result = checkOpenSpecCompatibility(`${MAX_VERIFIED_OPENSPEC.major + 1}.0.0`);
    expect(result.status).toBe('newer-than-verified');
  });

  it('refuses a version older than the supported layout', () => {
    const result = checkOpenSpecCompatibility('0.9.0');
    expect(result.status).toBe('older-than-supported');
    expect(result.usable).toBe(false);
  });

  it('degrades gracefully when the version is missing', () => {
    const result = checkOpenSpecCompatibility(undefined);
    expect(result.status).toBe('unreadable');
    expect(result.usable).toBe(true);
    expect(result.version).toBeUndefined();
  });

  it('degrades gracefully when the version is nonsense', () => {
    const result = checkOpenSpecCompatibility('not-a-version');
    expect(result.status).toBe('unreadable');
    expect(result.usable).toBe(true);
  });

  it('names the offending version in the message so the user can act on it', () => {
    expect(checkOpenSpecCompatibility('0.9.0').message).toContain('0.9.0');
  });
});
