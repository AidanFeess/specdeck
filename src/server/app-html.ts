import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The built client document.
 *
 * The client used to live in this file as one template literal, which kept
 * `npx specdeck` build free at the cost of hand-rolling everything it needed.
 * Rendering artifact markdown safely and editing it are not things worth
 * hand-rolling, so the client is now real modules under `src/client/`, bundled
 * and inlined by `scripts/build-client.mjs`.
 *
 * The runtime cost of that is nothing: the bundle is built when the package is
 * built, and what ships is still a single document that fetches nothing.
 *
 * The path below resolves the same way from `src/server/` during tests and from
 * `dist/server/` in the published package, because the build copies the
 * generated document into place alongside the compiled output.
 */

const DOCUMENT = new URL('../client/generated/app.html', import.meta.url);

function readDocument(): string {
  try {
    return readFileSync(fileURLToPath(DOCUMENT), 'utf8');
  } catch {
    // A missing bundle means the client was never built. Failing here with the
    // command that fixes it is far better than serving a blank page.
    throw new Error(
      'The specdeck client has not been built. Run `npm run build:client` (or `npm run build`).',
    );
  }
}

export const APP_HTML: string = readDocument();
