// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { renderMarkdown } from './markdown.js';

/**
 * The renderer turns a file out of somebody's repository into HTML, on a page
 * that can write files and create commits. These are not style assertions.
 *
 * Written in JavaScript rather than TypeScript because the client is: the whole
 * point of the client being untyped is that it is bundled, not compiled, and a
 * typed test importing it would only be testing declarations nobody wrote.
 */

/** Renders into a real document and hands back the resulting element. */
function mount(html) {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

describe('rendering artifact markdown', () => {
  it('renders the markdown OpenSpec artifacts actually use', () => {
    const html = renderMarkdown(
      [
        '## Why',
        '',
        'Because **it matters** and `code` reads well.',
        '',
        '### Requirement: A thing',
        '',
        '- **WHEN** something happens',
        '- **THEN** something else does',
        '',
        '[a link](https://example.com)',
      ].join('\n'),
    );

    expect(html).toContain('<h2>Why</h2>');
    expect(html).toContain('<strong>it matters</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<li>');
    expect(html).toContain('href="https://example.com"');
  });

  it('renders a script tag in a proposal as inert text', () => {
    const html = renderMarkdown('## Why\n\n<script>window.stolen = 1</script>\n');

    // Shown, so a reviewer can see what the file really contains...
    expect(html).toContain('&lt;script&gt;');
    // ...but never as markup.
    expect(html).not.toContain('<script');

    mount(html);
    expect(window.stolen).toBeUndefined();
  });

  it('strips event handler attributes', () => {
    const html = renderMarkdown('<img src=x onerror="window.stolen = 1">\n');

    // The text of the tag survives, because a reviewer should see what the file
    // says. What must not survive is an element carrying the handler, so the
    // assertion is made against the parsed DOM rather than against the string.
    const host = mount(html);

    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelectorAll('*[onerror]')).toHaveLength(0);
    expect(window.stolen).toBeUndefined();
  });

  it('drops javascript and data URLs from links', () => {
    const script = renderMarkdown('[click](javascript:window.stolen=1)\n');
    expect(mount(script).querySelector('a[href^="javascript:"]')).toBeNull();

    const data = renderMarkdown('[click](data:text/html;base64,PHNjcmlwdD4x)\n');
    expect(mount(data).querySelector('a[href^="data:"]')).toBeNull();
  });

  it('drops iframes, objects, and forms outright', () => {
    for (const source of [
      '<iframe src="https://example.com"></iframe>',
      '<object data="x"></object>',
      '<form action="https://example.com"><input name="a"></form>',
    ]) {
      const host = mount(renderMarkdown(source));
      expect(host.querySelector('iframe')).toBeNull();
      expect(host.querySelector('object')).toBeNull();
      expect(host.querySelector('form')).toBeNull();
      expect(host.querySelector('input')).toBeNull();
    }
  });

  it('returns nothing for nothing', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
    expect(renderMarkdown(null)).toBe('');
  });
});
