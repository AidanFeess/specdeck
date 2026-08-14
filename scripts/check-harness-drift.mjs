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
import { join } from 'node:path';

import { KNOWN_TOOLS } from '../dist/core/openspec/harness.js';
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
    execFileSync(process.execPath, [openspecBin, 'init', '.', '--tools', tool.id], {
      cwd: dir,
      stdio: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    });

    const files = listTree(dir).filter((f) => !f.startsWith('openspec/'));

    if (files.length === 0) {
      // Not a failure on its own: some tools write outside the project entirely.
      notes.push(`${tool.id}: produced no files inside the project (writes elsewhere?)`);
      continue;
    }

    if (tool.skillsDir !== undefined) {
      const hasSkills = files.some(
        (f) => f.startsWith(`${tool.skillsDir}/`) && /openspec-[a-z-]+\/SKILL\.md$/.test(f),
      );
      const hasAnythingThere = files.some((f) => f.startsWith(`${tool.skillsDir}/`));
      if (!hasSkills && !hasAnythingThere) {
        failures.push(
          `${tool.id}: expected files under "${tool.skillsDir}", got: ${files.slice(0, 5).join(', ')}`,
        );
      }
    }

    if (tool.commandsDir !== undefined) {
      const hasCommands = files.some((f) => f.startsWith(`${tool.commandsDir}/`));
      if (!hasCommands) {
        const dirs = [...new Set(files.map((f) => f.split('/').slice(0, -1).join('/')))];
        failures.push(
          `${tool.id}: expected commands under "${tool.commandsDir}", found directories: ${dirs.join(', ')}`,
        );
      }
    }
  } catch (error) {
    failures.push(`${tool.id}: init failed: ${error instanceof Error ? error.message : error}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
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
