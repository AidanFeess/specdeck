/**
 * Builds the project registry the screenshots are taken against.
 *
 *   node scripts/capture/registry.mjs <demo-root> <config-dir>
 *
 * The projects view reads specdeck's own registry, which normally lives in
 * `~/.specdeck/`. Capturing with that means publishing whoever ran the capture:
 * their username, the real names of their projects, and wherever those happen to
 * sit on disk. It also means the image differs for every contributor.
 *
 * So the capture run points `SPECDECK_CONFIG_DIR` at a throwaway directory and
 * this writes the registry into it, holding only the invented demo projects.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const demo = resolve(process.argv[2] ?? '../specdeck-demo');
const configDir = resolve(process.argv[3] ?? join(demo, '.specdeck-config'));

mkdirSync(configDir, { recursive: true });

// Order and stars are part of what the projects view shows, so they are set
// here rather than left to whatever order the registry happened to grow in.
const config = {
  version: 1,
  defaults: { handoffMethod: 'auto' },
  projects: [
    { path: join(demo, 'orbit'), starred: true, order: 0 },
    { path: join(demo, 'atlas'), starred: true, order: 1 },
    { path: join(demo, 'harbor'), order: 2 },
  ],
};

writeFileSync(join(configDir, 'config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(configDir);
