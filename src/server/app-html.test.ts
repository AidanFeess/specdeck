import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { APP_HTML } from './app-html.js';
import { CONTENT_SECURITY_POLICY } from './csp.js';

/**
 * The client is bundled and inlined into one document. A break in that pipeline
 * is not a type error and not a lint error: it is a blank page in a browser,
 * which has happened once already alongside a fully green test run.
 *
 * So the served document is parsed here, and the properties that make it safe
 * to serve are asserted rather than assumed.
 *
 * Assertions about *behavior* read the client sources, not the served script.
 * The served script is minified, so matching identifiers in it would only ever
 * be testing the minifier.
 */

const roots: string[] = [];

afterAll(() => {
  for (const dir of roots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows can briefly hold a handle after a child process exits.
    }
  }
});

const clientSource = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../client/${name}`, import.meta.url)), 'utf8');

function extractScript(): string {
  const match = /<script>([\s\S]*?)<\/script>/.exec(APP_HTML);
  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('served client document', () => {
  it('contains a script that actually parses as JavaScript', () => {
    const dir = mkdtempSync(join(tmpdir(), 'specdeck-client-'));
    roots.push(dir);
    const file = join(dir, 'client.js');
    writeFileSync(file, extractScript(), 'utf8');

    // `node --check` is a real parse, unlike a regex sanity check, and it
    // reports the exact line when it fails.
    expect(() =>
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }),
    ).not.toThrow();
  });

  it('is a complete document with the elements the script reaches for', () => {
    expect(APP_HTML.startsWith('<!doctype html>')).toBe(true);
    for (const id of [
      'board',
      'specs',
      'setup',
      'home',
      'syncbar',
      'panel',
      'modal',
      'toast',
      'banners',
      'scan',
      'counts',
      'pname',
      'filter',
      'themeBtn',
      'viewHome',
      'viewBoard',
      'viewSpecs',
    ]) {
      expect(APP_HTML, `missing element id "${id}"`).toContain(`id="${id}"`);
    }
  });

  it('has balanced script and style tags', () => {
    const count = (needle: string): number => APP_HTML.split(needle).length - 1;
    expect(count('<script>')).toBe(count('</script>'));
    expect(count('<style>')).toBe(count('</style>'));
  });

  it('carries the whole client, not a reference to it', () => {
    // The point of the bundle: one response, nothing else fetched. A CDN link
    // or a separate script tag would break `npx specdeck` for anyone offline.
    //
    // Checked against the markup and the stylesheet rather than the whole
    // document, because the bundle legitimately contains strings like "@import"
    // inside the editor's CSS tokenizer, and matching those would be testing a
    // dependency's data tables rather than this document.
    const markup = APP_HTML.replace(/<script>[\s\S]*?<\/script>/, '');
    const styles = /<style>([\s\S]*?)<\/style>/.exec(APP_HTML)?.[1] ?? '';

    expect(/\b(?:src|href)\s*=\s*["']?https?:/i.test(markup)).toBe(false);
    expect(/@import/i.test(styles)).toBe(false);
    expect(/url\(\s*["']?https?:/i.test(styles)).toBe(false);

    // And it really is the whole thing, not an empty shell.
    expect(extractScript().length).toBeGreaterThan(50_000);
  });
});

describe('content security policy', () => {
  it('allows the served script by hash rather than by unsafe-inline', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'sha256-");
    expect(CONTENT_SECURITY_POLICY).not.toContain("script-src 'unsafe-inline'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("script-src 'self'");
  });

  it('computes a hash that matches the script actually served', () => {
    // A wrong hash is a blank page, so it is checked the way a browser would.
    const expected = `sha256-${createHash('sha256').update(extractScript(), 'utf8').digest('base64')}`;
    expect(CONTENT_SECURITY_POLICY).toContain(expected);
  });

  it('confines the page to this server and blocks embedding', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("form-action 'none'");
  });
});

describe('client sources', () => {
  it('preserves scroll against the element that actually scrolls', () => {
    // The panel is a flex column: the aside is fixed and .abody scrolls. An
    // earlier version captured scrollTop from the aside, which is always 0, so
    // every rescan threw the reader back to the top. While an agent writes files
    // that fires every few seconds and makes the panel unreadable.
    const script = clientSource('app.js');

    // Capture and restore must both name the scrolling element.
    expect(script).toContain("panel.querySelector('.abody')");
    expect(script).toContain('body.scrollTop = scrollTop');

    // And must not have gone back to the aside, which does not scroll.
    expect(script).not.toContain('a.scrollTop = scrollTop');

    // Every rebuilt container is covered, not just the panel.
    expect(script).toContain('function captureScroll');
    expect(script).toContain('function restoreScroll');
    expect(script.split('restoreScroll(scroll)').length - 1).toBeGreaterThanOrEqual(3);
  });

  it('boots from the entry point rather than at import time', () => {
    // Module imports are all evaluated before any statement in the importer, so
    // a client that booted from module scope would render before the entry
    // point had finished wiring anything up.
    expect(clientSource('app.js')).toContain('export function boot()');
    expect(clientSource('index.js')).toContain('boot()');
  });
});
