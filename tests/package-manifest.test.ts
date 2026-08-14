import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * These assertions guard the packaging contract rather than any feature.
 *
 * specdeck is distributed to be run with `npx specdeck`, so a manifest that
 * points its bin entry at a path the build does not produce fails only at the
 * moment a user first tries to run it. That is far too late to find out.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface PackageManifest {
  name: string;
  type: string;
  bin: Record<string, string>;
  files: string[];
  engines: { node: string };
  scripts: Record<string, string>;
}

function readManifest(): PackageManifest {
  const raw = readFileSync(join(repoRoot, 'package.json'), 'utf8');
  return JSON.parse(raw) as PackageManifest;
}

describe('package manifest', () => {
  const manifest = readManifest();

  it('publishes the command users are told to run', () => {
    expect(manifest.name).toBe('specdeck');
    expect(Object.keys(manifest.bin)).toContain('specdeck');
  });

  it('points its bin entry inside a directory that ships', () => {
    const binTarget = manifest.bin.specdeck;
    expect(binTarget).toBeDefined();
    // The bin path must land under a directory listed in "files", otherwise the
    // published tarball resolves to nothing.
    expect(binTarget?.startsWith('./dist/')).toBe(true);
    expect(manifest.files).toContain('dist');
  });

  it('is an ES module, matching the OpenSpec package it consumes', () => {
    expect(manifest.type).toBe('module');
  });

  it('requires a Node version that satisfies the OpenSpec dependency', () => {
    // @fission-ai/openspec declares >=20.19.0. Declaring anything lower would
    // let npm install specdeck onto a runtime its own dependency rejects.
    expect(manifest.engines.node).toBe('>=20.19.0');
  });

  it('exposes a single verify script that runs every gate CI runs', () => {
    const verify = manifest.scripts.verify ?? '';
    for (const gate of ['format:check', 'lint', 'typecheck', 'test']) {
      expect(verify).toContain(gate);
    }
  });
});
