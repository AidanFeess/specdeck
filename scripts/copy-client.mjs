import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies the built client next to the compiled server.
 *
 * `tsc` only emits TypeScript, so the generated document has to be placed by
 * hand. It lands at the same relative path in `dist/` that it occupies in
 * `src/`, which is what lets `app-html.ts` resolve it identically whether it is
 * running from source during tests or from the published package.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'src', 'client', 'generated', 'app.html');
const to = join(root, 'dist', 'client', 'generated', 'app.html');

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);

console.log(`client: copied to ${to.slice(root.length + 1)}`);
