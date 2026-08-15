import { marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Rendering artifact markdown.
 *
 * This is the first place specdeck turns repository content into HTML, which
 * makes it the first place a repository can attack the person reading it. The
 * page it renders into can write files and create commits on this machine, and
 * it is served from localhost with no authentication, so a `<script>` in a
 * proposal is not a rendering curiosity.
 *
 * Two independent defences, because one of them will eventually be wrong:
 *
 *  1. Raw HTML in the source is rendered as visible text rather than markup, so
 *     a reader reviewing a spec sees exactly what the file says.
 *  2. Whatever comes out is then sanitized against an allowlist that contains
 *     no script, no embedded content, no forms, and no event handlers.
 *
 * The allowlist is deliberately the set of things markdown itself produces.
 * Anything outside it is not markdown, so removing it costs nothing real.
 */

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'strong',
  'em',
  'del',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
  'span',
  'div',
];

const ALLOWED_ATTR = ['href', 'title', 'class', 'id', 'align', 'start'];

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Raw HTML blocks and inline HTML become text. Done at the renderer rather than
// left entirely to the sanitizer so that a spec containing markup is *shown*,
// not silently emptied, which would misrepresent the file being reviewed.
marked.use({
  renderer: {
    html(token) {
      return escapeHtml(token.raw ?? token.text ?? '');
    },
  },
});

/**
 * Turns markdown into sanitized HTML.
 *
 * Returns a string rather than a node so callers can decide where it goes, and
 * so the result is testable without a browser.
 */
export function renderMarkdown(source) {
  if (typeof source !== 'string' || source === '') return '';

  const html = marked.parse(source, { async: false, gfm: true, breaks: false });

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Anything with a scheme other than the ones markdown links legitimately
    // use is dropped, which is what stops `javascript:` and `data:` hrefs.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/|\.\/|\.\.\/)/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'meta'],
    // Belt and braces: DOMPurify strips handlers anyway, and saying so here
    // means a future change to the allowlist cannot quietly let them back in.
    FORBID_ATTR: ['style', 'srcset', 'formaction', 'action', 'target'],
  });
}
