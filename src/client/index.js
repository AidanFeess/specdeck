import { renderMarkdown } from './markdown.js';
import { createEditor } from './editor.js';
import { boot } from './app.js';

/**
 * The client entry point.
 *
 * The view code in `app.js` is a flat imperative script that shares everything
 * through the module scope it was written in. Rather than rewrite that to take
 * injected dependencies, the pieces that came from real libraries are hung on
 * one namespace it can reach. The alternative, importing them into `app.js`
 * directly, is fine too and is how new code should do it; this exists so the
 * split did not have to touch 1,500 lines that were working.
 */
window.specdeck = { renderMarkdown, createEditor };

boot();
