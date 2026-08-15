import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds the client into one self-contained document.
 *
 * `npx specdeck@latest` has to be instant and has to work offline, so the page
 * the server hands back must not fetch anything: no CDN, no separate script or
 * stylesheet request. Everything is inlined here, at package build time, and
 * the published package ships the result rather than the sources. That is also
 * why every client library is a devDependency — none of them are installed by
 * someone running specdeck.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = join(root, 'src', 'client');
const outDir = join(clientDir, 'generated');

const bundle = await build({
  entryPoints: [join(clientDir, 'index.js')],
  bundle: true,
  // An IIFE rather than a module: the script is inlined into the document, and
  // a `type="module"` inline script would be deferred and change boot ordering.
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  write: false,
  legalComments: 'none',
});

const script = bundle.outputFiles[0].text;
const styles = readFileSync(join(clientDir, 'styles.css'), 'utf8');
const shell = readFileSync(join(clientDir, 'shell.html'), 'utf8');

// A closing script tag inside the bundle would end the inline script early.
// esbuild will not produce one from source, but a string literal in a
// dependency could, and the failure mode is a blank page rather than an error.
if (/<\/script/i.test(script)) {
  throw new Error('The client bundle contains a closing script tag and cannot be inlined.');
}

const document = shell.replace('/*STYLES*/', () => styles).replace('/*SCRIPT*/', () => script);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'app.html'), document, 'utf8');

const kb = (text) => `${Math.round(text.length / 1024)}kb`;
console.log(`client: script ${kb(script)}, styles ${kb(styles)}, document ${kb(document)}`);
