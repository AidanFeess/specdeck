import { renderMarkdown } from './markdown.js';
import { createEditor } from './editor.js';
import { automation, boot } from './app.js';

/**
 * The client entry point.
 *
 * `window.specdeck` carries two unrelated things, both deliberately:
 *
 * - The pieces that came from real libraries, so the flat imperative view code
 *   in `app.js` can reach them without being rewritten to take injected
 *   dependencies. Importing them into `app.js` directly is fine too and is how
 *   new code should do it; this exists so the split did not have to touch 1,500
 *   lines that were working.
 * - The automation surface `scripts/capture/` drives the screenshots through.
 *   The client is bundled, so its internals live in a closure and are no longer
 *   reachable as globals. Naming what automation may touch means renaming an
 *   internal variable cannot silently break the images in the README.
 */
window.specdeck = { renderMarkdown, createEditor, ...automation };

boot();
