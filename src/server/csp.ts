import { createHash } from 'node:crypto';

import { APP_HTML } from './app-html.js';

/**
 * The Content-Security-Policy for the served document.
 *
 * specdeck renders markdown that came out of a repository, on a page that can
 * write files and create commits. The renderer sanitizes, but sanitizers have
 * bugs, and this is the layer that holds when one does.
 *
 * The inline script is allowed by hash rather than by `unsafe-inline`, so the
 * exact bundle that was built is the only script the page will run. The hash is
 * computed from the served document itself, which means it cannot drift out of
 * agreement with what is actually being sent.
 */

/** SHA-256 of the document's inline script, base64, as CSP expects it. */
function scriptHash(html: string): string | undefined {
  const match = /<script>([\s\S]*?)<\/script>/.exec(html);
  const script = match?.[1];
  if (script === undefined) return undefined;
  // The quotes are part of the CSP grammar, not decoration. Without them the
  // source expression is invalid, the browser ignores it, and the page runs no
  // script at all.
  return `'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`;
}

function build(html: string): string {
  const hash = scriptHash(html);

  return [
    "default-src 'none'",
    // No hash means no inline script was found, which should be impossible.
    // Sending a policy that blocks all script is the safe way to be wrong.
    `script-src ${hash ?? "'none'"}`,
    // Styles stay `unsafe-inline` because the editor injects rules at runtime.
    // That is a real relaxation, and a narrow one: style injection cannot
    // execute code, and script is still locked to a single known hash.
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    // The page talks to this server and nowhere else. This is the directive
    // that stops a malicious spec exfiltrating anything it managed to read.
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}

export const CONTENT_SECURITY_POLICY: string = build(APP_HTML);
