import type { ProjectOverview } from './overview.js';

/**
 * Ordering the projects list.
 *
 * Starring is a partition, not a sort key. Starred projects always occupy the
 * top and are never reordered by a sort, because sorting them would defeat the
 * reason for starring: the user has already said what order those should be in.
 *
 * The sort therefore applies only to the unstarred remainder.
 */

export const PROJECT_SORTS = ['manual', 'name', 'activity', 'tasks'] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

export function isProjectSort(value: unknown): value is ProjectSort {
  return typeof value === 'string' && (PROJECT_SORTS as readonly string[]).includes(value);
}

/** What the ordering needs to know about a project, beyond its overview. */
export interface ProjectPlacement {
  path: string;
  starred?: boolean;
  /** Explicit position. Absent means unplaced. */
  order?: number;
}

/**
 * Compares by stored position.
 *
 * Unplaced entries sort after placed ones, keeping their existing sequence, so
 * a configuration nobody has arranged opens in exactly the order it lists.
 */
function byStoredOrder(
  a: ProjectPlacement | undefined,
  b: ProjectPlacement | undefined,
  fallbackA: number,
  fallbackB: number,
): number {
  const orderA = a?.order;
  const orderB = b?.order;

  if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
  if (orderA !== undefined) return -1;
  if (orderB !== undefined) return 1;
  return fallbackA - fallbackB;
}

function remaining(overview: ProjectOverview): number {
  return Math.max(0, overview.tasksTotal - overview.tasksCompleted);
}

/**
 * Orders overviews for display.
 *
 * @param overviews The projects to order.
 * @param placements Star and position, keyed by project path.
 * @param sort Applied to the unstarred group only.
 */
export function orderProjects(
  overviews: ProjectOverview[],
  placements: Map<string, ProjectPlacement>,
  sort: ProjectSort,
): ProjectOverview[] {
  const originalIndex = new Map(overviews.map((overview, index) => [overview.path, index]));
  const indexOf = (overview: ProjectOverview): number => originalIndex.get(overview.path) ?? 0;

  const starred: ProjectOverview[] = [];
  const rest: ProjectOverview[] = [];
  for (const overview of overviews) {
    if (placements.get(overview.path)?.starred === true) starred.push(overview);
    else rest.push(overview);
  }

  // The starred group is always in stored order, whatever the sort is.
  starred.sort((a, b) =>
    byStoredOrder(placements.get(a.path), placements.get(b.path), indexOf(a), indexOf(b)),
  );

  rest.sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name);

      case 'activity': {
        // A project with no known activity sorts last rather than first, since
        // an absent date is not the same as an ancient one.
        const timeA = a.lastActivity === undefined ? -Infinity : Date.parse(a.lastActivity);
        const timeB = b.lastActivity === undefined ? -Infinity : Date.parse(b.lastActivity);
        if (timeA === timeB) return a.name.localeCompare(b.name);
        return timeB - timeA;
      }

      case 'tasks': {
        const left = remaining(a);
        const right = remaining(b);
        if (left === right) return a.name.localeCompare(b.name);
        return right - left;
      }

      case 'manual':
      default:
        return byStoredOrder(
          placements.get(a.path),
          placements.get(b.path),
          indexOf(a),
          indexOf(b),
        );
    }
  });

  return [...starred, ...rest];
}
