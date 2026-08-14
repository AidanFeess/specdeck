import type { ParseIssue, Task, TaskGroup, TaskList } from '../model/types.js';
import { buildFenceMask, splitLines } from './markdown.js';

/**
 * Parses `tasks.md` checkboxes.
 *
 * The format OpenSpec's apply phase tracks is `- [ ] 1.1 description` grouped
 * under `## 1. Heading`. Anything that is not a checkbox is not tracked, so a
 * tasks file whose items are plain bullets reports zero progress forever. That
 * is reported rather than shown as an empty list.
 *
 * Line numbers are recorded because toggling a checkbox rewrites that exact
 * line, verified against its current content.
 */

const GROUP_HEADING = /^\s{0,3}#{2,3}\s+(?:(\d+(?:\.\d+)*)\.?\s+)?(.*)$/;
const CHECKBOX = /^(\s*)[-*]\s+\[([ xX])\]\s+(?:(\d+(?:\.\d+)*)\s+)?(.*)$/;
const PLAIN_BULLET = /^\s*[-*]\s+(?!\[[ xX]\])\S/;

export function parseTasks(content: string | undefined, path: string): TaskList {
  const issues: ParseIssue[] = [];

  if (content === undefined) {
    return { groups: [], completed: 0, total: 0, issues };
  }

  const lines = splitLines(content);
  const fenced = buildFenceMask(lines);

  const groups: TaskGroup[] = [];
  let current: TaskGroup | undefined;
  let completed = 0;
  let total = 0;
  let plainBullets = 0;

  for (let i = 0; i < lines.length; i += 1) {
    if (fenced[i]) continue;
    const line = lines[i] ?? '';

    const checkbox = CHECKBOX.exec(line);
    if (checkbox) {
      if (current === undefined) {
        // Tasks before any heading still count. Losing them would understate
        // progress on a file that OpenSpec itself would track fine.
        current = { title: 'Tasks', tasks: [], line: i + 1 };
        groups.push(current);
      }
      const done = (checkbox[2] ?? ' ').toLowerCase() === 'x';
      const task: Task = {
        text: (checkbox[4] ?? '').trim(),
        completed: done,
        line: i + 1,
      };
      const id = checkbox[3];
      if (id !== undefined) task.id = id;
      current.tasks.push(task);
      total += 1;
      if (done) completed += 1;
      continue;
    }

    const heading = GROUP_HEADING.exec(line);
    if (heading) {
      const group: TaskGroup = { title: (heading[2] ?? '').trim(), tasks: [], line: i + 1 };
      const number = heading[1];
      if (number !== undefined) group.number = number;
      groups.push(group);
      current = group;
      continue;
    }

    if (PLAIN_BULLET.test(line)) plainBullets += 1;
  }

  if (total === 0 && plainBullets > 0) {
    issues.push({
      severity: 'error',
      message:
        `This tasks file has ${plainBullets} bullet ${plainBullets === 1 ? 'item' : 'items'} but no ` +
        'checkboxes. OpenSpec only tracks items written as "- [ ] description", so none of this ' +
        'work counts as progress.',
      path,
    });
  } else if (total === 0) {
    issues.push({
      severity: 'warning',
      message: 'This tasks file contains no tasks.',
      path,
    });
  }

  return {
    groups: groups.filter((g) => g.tasks.length > 0 || g.title !== ''),
    completed,
    total,
    issues,
  };
}

/**
 * Rewrites a single checkbox line, returning the new file content.
 *
 * Returns undefined when the target line does not currently look like a
 * checkbox with the expected text. That guard is the whole point: an agent may
 * have rewritten the file since it was read, and a blind line write would
 * silently clobber its work.
 */
export function toggleTaskLine(
  content: string,
  line: number,
  expectedText: string,
  completed: boolean,
): string | undefined {
  const lines = splitLines(content);
  const index = line - 1;
  const target = lines[index];
  if (target === undefined) return undefined;

  const match = CHECKBOX.exec(target);
  if (!match) return undefined;
  if ((match[4] ?? '').trim() !== expectedText.trim()) return undefined;

  const indent = match[1] ?? '';
  const id = match[3] === undefined ? '' : `${match[3]} `;
  const bullet = target.trimStart().startsWith('*') ? '*' : '-';
  lines[index] = `${indent}${bullet} [${completed ? 'x' : ' '}] ${id}${match[4] ?? ''}`;
  return lines.join('\n');
}
