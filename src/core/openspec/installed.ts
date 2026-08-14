import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';

import { checkOpenSpecCompatibility, type CompatibilityResult } from './version.js';

/**
 * Locating the bundled OpenSpec package on disk.
 *
 * The package's `exports` map only declares its root entry point, so resolving
 * `@fission-ai/openspec/package.json` directly fails with
 * ERR_PACKAGE_PATH_NOT_EXPORTED. The version therefore has to be read by
 * resolving the entry point and walking up to the package root.
 */

const OPENSPEC_PACKAGE_NAME = '@fission-ai/openspec';

interface MinimalManifest {
  name?: unknown;
  version?: unknown;
}

function readManifestAt(directory: string): MinimalManifest | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Walks up from a resolved module file to the directory holding the manifest
 * for the named package.
 */
function findPackageRoot(startFile: string, packageName: string): string | undefined {
  const { root } = parsePath(startFile);
  let current = dirname(startFile);

  while (true) {
    const manifest = readManifestAt(current);
    if (manifest && manifest.name === packageName) return current;

    const parent = dirname(current);
    if (parent === current || current === root) return undefined;
    current = parent;
  }
}

/**
 * Locates the root directory of the bundled OpenSpec package.
 *
 * Needed for reading files that ship with the package, such as the built-in
 * workflow schemas. Those are read as files rather than imported, so the
 * `exports` restriction does not apply to them.
 *
 * Returns undefined rather than throwing. A missing package root degrades
 * schema resolution to project-local and user schemas, which the caller reports.
 */
export function findBundledOpenSpecRoot(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const entry = require.resolve(OPENSPEC_PACKAGE_NAME);
    return findPackageRoot(entry, OPENSPEC_PACKAGE_NAME);
  } catch {
    return undefined;
  }
}

/**
 * Reads the version of the OpenSpec package bundled with this installation.
 *
 * Returns undefined rather than throwing. A missing version is a degraded
 * signal, not a reason to refuse to start.
 */
export function readBundledOpenSpecVersion(): string | undefined {
  const packageRoot = findBundledOpenSpecRoot();
  if (packageRoot === undefined) return undefined;

  const manifest = readManifestAt(packageRoot);
  const version = manifest?.version;
  return typeof version === 'string' ? version : undefined;
}

/**
 * Checks the bundled OpenSpec package against the range specdeck understands.
 */
export function checkBundledOpenSpec(): CompatibilityResult {
  return checkOpenSpecCompatibility(readBundledOpenSpecVersion());
}
