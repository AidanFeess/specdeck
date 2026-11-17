#!/usr/bin/env node
/**
 * Detects drift between what OpenSpec generates and what specdeck expects.
 *
 * specdeck carries its own table of per-tool configuration directories and
 * slash command shapes, because OpenSpec exports neither. When OpenSpec changes
 * where a tool's files go, nothing breaks loudly: the harness is simply reported
 * as unconfigured, and handoff quietly falls back to copying a prompt. This
 * script turns that silence into a failing build.
 *
 * Run with `node scripts/check-harness-drift.mjs`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';

import { KNOWN_TOOLS, detectHarnesses, buildHandoff } from '../dist/core/openspec/harness.js';
import { localFileSource } from '../dist/core/fs/node-source.js';
import { findBundledOpenSpecRoot } from '../dist/core/openspec/installed.js';

const packageRoot = findBundledOpenSpecRoot();
if (packageRoot === undefined) {
  console.error('Could not locate the bundled OpenSpec package.');
  process.exit(1);
}
const openspecBin = join(packageRoot, 'bin', 'openspec.js');

function listTree(root) {
  const out = [];
  (function walk(dir, prefix) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (statSync(full).isFile()) out.push(rel);
    }
  })(root, '');
  return out.sort();
}

const failures = [];
const notes = [];

for (const tool of KNOWN_TOOLS) {
  const dir = mkdtempSync(join(tmpdir(), `drift-${tool.id}-`));
  try {
    execFileSync(
      process.execPath,
      [openspecBin, 'init', '.', '--scope', 'project', '--tools', tool.id],
      {
        cwd: dir,
        stdio: 'pipe',
        env: {
          ...process.env,
          NO_COLOR: '1',
          OPENSPEC_TELEMETRY: '0',
          OPENSPEC_NO_UPDATE_CHECK: '1',
          HOME: dir,
          USERPROFILE: dir,
          XDG_CONFIG_HOME: join(dir, '.config'),
          XDG_DATA_HOME: join(dir, '.data'),
          APPDATA: join(dir, '.appdata'),
          CODEX_HOME: join(dir, '.codex-home'),
        },
        timeout: 60_000,
      },
    );

    const files = listTree(dir).filter((f) => !f.startsWith('openspec/'));

    if (files.length === 0) {
      // Not a failure on its own: some tools write outside the project entirely.
      notes.push(`${tool.id}: produced no files inside the project (writes elsewhere?)`);
      continue;
    }

    const detected = await detectHarnesses(localFileSource, dir);
    const payload = buildHandoff('example-change', 'apply', detected);
    if (!payload.command?.includes('openspec-apply-change')) {
      failures.push(
        `${tool.id}: generated skills did not produce an apply handoff: ${files.slice(0, 5).join(', ')}`,
      );
    }
    if (!files.some((f) => f === '.agents/skills/openspec-apply-change/SKILL.md')) {
      failures.push(`${tool.id}: missing shared project apply skill`);
    }
  } catch (error) {
    failures.push(`${tool.id}: init failed: ${error instanceof Error ? error.message : error}`);
  } finally {
    const rel = relative(resolve(tmpdir()), resolve(dir));
    if (rel && !rel.startsWith('..') && !isAbsolute(rel))
      rmSync(dir, { recursive: true, force: true });
    else failures.push('Unsafe fixture cleanup path; fixture left in place.');
  }
}

for (const note of notes) console.log(`note  ${note}`);

if (failures.length > 0) {
  console.error('\nOpenSpec generation has drifted from what specdeck expects:\n');
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nUpdate KNOWN_TOOLS in src/core/openspec/harness.ts to match, then re-run.\n' +
      'Until it is updated, these harnesses will be reported as unconfigured.',
  );
  process.exit(1);
}

console.log(`\nAll ${KNOWN_TOOLS.length} known tools still generate where specdeck expects.`);
