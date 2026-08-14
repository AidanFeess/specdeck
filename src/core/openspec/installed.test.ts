import { describe, expect, it } from 'vitest';

import { checkBundledOpenSpec, readBundledOpenSpecVersion } from './installed.js';
import { parseVersion } from './version.js';

describe('readBundledOpenSpecVersion', () => {
  it('reads a version from the OpenSpec package that ships with specdeck', () => {
    // This is the assertion that catches the failure mode the module exists for:
    // OpenSpec's exports map blocks resolving its package.json by subpath, so
    // the version has to be found by walking up from the resolved entry point.
    // If that walk ever breaks, this goes undefined.
    const version = readBundledOpenSpecVersion();
    expect(version).toBeDefined();
    expect(parseVersion(version ?? '')).toBeDefined();
  });
});

describe('checkBundledOpenSpec', () => {
  it('reports the pinned dependency as supported', () => {
    // The dependency is pinned to an exact version, so a bump that moves past
    // the verified range should fail here and force a deliberate decision
    // about the parsers rather than sliding through unnoticed.
    const result = checkBundledOpenSpec();
    expect(result.status).toBe('supported');
    expect(result.usable).toBe(true);
  });
});
