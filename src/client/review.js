import { renderMarkdown } from './markdown.js';

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function markdown(text) {
  const element = node('div', 'md');
  element.innerHTML = renderMarkdown(text);
  return element;
}

function pair(before, after, raw = false, labels = ['Current', 'Proposed']) {
  const row = node('div', 'review-pair');
  [before, after].forEach((text, index) => {
    const column = node('section', 'review-version');
    column.append(node('h4', null, labels[index]));
    column.append(
      text === undefined
        ? node('p', 'muted', 'Not present')
        : raw
          ? node('pre', null, text)
          : markdown(text),
    );
    row.append(column);
  });
  return row;
}

function disclosure(title) {
  const details = node('details', 'review-disclosure');
  details.append(node('summary', null, title));
  return details;
}

export function renderReview(host, data) {
  host.replaceChildren();
  host.append(node('h3', null, 'Behavior review'));
  host.append(
    node(
      'p',
      'muted',
      `${data.baseline}. This is a structural comparison, not validation or test evidence.`,
    ),
  );
  if (data.reason) host.append(node('p', 'muted', data.reason));
  else if (!data.capabilities.length)
    host.append(node('p', 'muted', 'This change has no spec deltas to compare.'));
  for (const capability of data.capabilities) {
    const section = node('section', 'review-capability');
    section.append(node('h3', null, capability.capability));
    if (capability.issues.length) {
      section.append(node('p', 'review-warning', 'Resulting preview unavailable'));
      const list = node('ul');
      for (const issue of capability.issues) list.append(node('li', null, issue));
      section.append(list);
    }
    for (const comparison of capability.comparisons) {
      const detail = disclosure(`${comparison.operation.toUpperCase()} · ${comparison.name}`);
      detail.open = true;
      if (
        comparison.before?.name !== comparison.after?.name &&
        comparison.operation === 'renamed'
      ) {
        detail.append(
          node(
            'p',
            'muted',
            `${comparison.before?.name ?? 'Unknown'} → ${comparison.after?.name ?? 'Unknown'}`,
          ),
        );
      }
      detail.append(pair(comparison.before?.text, comparison.after?.text));
      const changed = comparison.scenarios.filter((s) => s.status !== 'unchanged');
      const unchanged = comparison.scenarios.filter((s) => s.status === 'unchanged');
      detail.append(
        node('p', 'muted', `${changed.length} changed scenarios · ${unchanged.length} unchanged`),
      );
      for (const scenario of changed) {
        detail.append(node('h4', null, `${scenario.status.toUpperCase()} · ${scenario.name}`));
        detail.append(pair(scenario.before?.body, scenario.after?.body));
      }
      if (unchanged.length) {
        const hidden = disclosure(`Unchanged scenarios (${unchanged.length})`);
        for (const scenario of unchanged) {
          hidden.append(node('h4', null, scenario.name), markdown(scenario.after.body));
        }
        detail.append(hidden);
      }
      section.append(detail);
    }
    if (capability.preview) {
      const preview = disclosure(
        `Resulting capability (${capability.preview.length} requirements)`,
      );
      if (!capability.preview.length) preview.append(node('p', 'muted', 'No requirements remain.'));
      for (const requirement of capability.preview) {
        preview.append(node('h4', null, requirement.name), markdown(requirement.text));
        for (const scenario of requirement.scenarios)
          preview.append(node('h5', null, scenario.name), markdown(scenario.body));
      }
      section.append(preview);
    }
    host.append(section);
  }
  host.append(node('h3', null, 'Since last approval'));
  const approval = data.approval;
  if (approval.status === 'never-approved')
    host.append(node('p', 'muted', 'No approval has been recorded for this change.'));
  else if (approval.status === 'unavailable')
    host.append(node('p', 'review-warning', approval.reason));
  else {
    host.append(
      node(
        'p',
        'muted',
        `Compared with ${approval.latest.commit.slice(0, 12)}, approved by ${approval.latest.approver.name}.`,
      ),
    );
    if (!approval.artifacts.length)
      host.append(node('p', 'muted', 'No text artifact changes since approval.'));
    for (const artifact of approval.artifacts) {
      const detail = disclosure(`${artifact.status.toUpperCase()} · ${artifact.path}`);
      detail.append(pair(artifact.before, artifact.after, true, ['Approved', 'Current']));
      host.append(detail);
    }
  }
}

export async function loadReview(host, name) {
  host.append(node('p', 'muted', 'Loading review…'));
  try {
    const response = await fetch(`/api/review?change=${encodeURIComponent(name)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load review.');
    renderReview(host, data);
  } catch (error) {
    host.replaceChildren(node('p', 'review-warning', error.message || 'Could not load review.'));
    const retry = node('button', null, 'Retry');
    retry.onclick = () => {
      host.replaceChildren();
      void loadReview(host, name);
    };
    host.append(retry);
  }
}
