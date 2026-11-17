// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderReview, loadReview } from './review.js';

afterEach(() => vi.unstubAllGlobals());
const base = {
  baseline: 'Current specs on disk',
  capabilities: [],
  approval: { status: 'never-approved', artifacts: [] },
};

describe('review UI', () => {
  it('shows unavailable comparisons without implying no changes', () => {
    const host = document.createElement('div');
    renderReview(host, {
      ...base,
      approval: { status: 'unavailable', reason: 'History unavailable', artifacts: [] },
    });
    expect(host.textContent).toContain('History unavailable');
    expect(host.textContent).not.toContain('No text artifact changes');
  });
  it('renders comparisons safely and keeps preview and unchanged scenarios collapsible', () => {
    const host = document.createElement('div');
    const requirement = {
      name: '<img src=x onerror=alert(1)>',
      text: '<script>alert(1)</script>',
      scenarios: [],
    };
    renderReview(host, {
      ...base,
      capabilities: [
        {
          capability: '<svg onload=alert(1)>',
          issues: [],
          comparisons: [
            {
              name: requirement.name,
              operation: 'modified',
              before: requirement,
              after: requirement,
              scenarios: [{ name: 'Existing', status: 'unchanged', after: { body: 'Safe' } }],
            },
          ],
          preview: [requirement],
        },
      ],
    });
    expect(host.querySelector('script, svg, img, [onerror], [onload]')).toBeNull();
    expect(host.querySelectorAll('details:not([open])')).toHaveLength(2);
    expect(host.textContent).toContain('Resulting capability');
  });
  it('shows additions and deletions since approval as literal source', () => {
    const host = document.createElement('div');
    renderReview(host, {
      ...base,
      approval: {
        status: 'available',
        latest: { commit: 'abc123', approver: { name: 'Reviewer' } },
        artifacts: [{ path: 'proposal.md', status: 'removed', before: '<script>old</script>' }],
      },
    });
    expect(host.querySelector('pre').textContent).toBe('<script>old</script>');
    expect(host.querySelector('script')).toBeNull();
    expect(host.textContent).toContain('Not present');
  });
  it('offers retry after a failed API request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline')));
    const host = document.createElement('div');
    await loadReview(host, 'a/b');
    expect(fetch).toHaveBeenCalledWith('/api/review?change=a%2Fb');
    expect(host.textContent).toContain('Offline');
    expect(host.querySelector('button').textContent).toBe('Retry');
  });
});
