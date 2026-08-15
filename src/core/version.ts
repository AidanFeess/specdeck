import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * specdeck's own version, read from its manifest at runtime.
 *
 * Not baked in at build time, because a constant that has to be kept in step
 * with package.json is a constant that eventually disagrees with it, and the
 * disagreement is invisible.
 *
 * This matters more than it looks. `npx specdeck` resolves the latest release
 * and caches it per version, so a user can easily be running something other
 * than what they expect. Without this they have no way to find out.
 */

let cached: string | undefined;

export function specdeckVersion(): string {
  if (cached !== undefined) return cached;

  // Walk up from the compiled file to the package root. Two levels from
  // dist/core, and the source tree layout resolves the same way under vitest.
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, '..', '..', 'package.json'),
    join(here, '..', '..', '..', 'package.json'),
  ]) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
      if (typeof parsed === 'object' && parsed !== null) {
        const record = parsed as { name?: unknown; version?: unknown };
        if (record.name === 'specdeck' && typeof record.version === 'string') {
          cached = record.version;
          return cached;
        }
      }
    } catch {
      // Try the next candidate.
    }
  }

  cached = 'unknown';
  return cached;
}
