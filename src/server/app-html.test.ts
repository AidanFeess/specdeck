import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { APP_HTML } from './app-html.js';

/**
 * The client is a single served document held in a TypeScript template literal.
 * That means a stray backtick or a mangled escape sequence is neither a type
 * error nor a lint error: it is a syntax error that only appears in the browser,
 * where it kills the entire script and leaves a blank page.
 *
 * That has already happened once, with a full green test run alongside it. So
 * the served script gets parsed here.
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
});
