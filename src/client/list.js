/**
 * The change list.
 *
 * The board answers "what is happening in this project". This answers "what is
 * happening at all": every change across every registered root, sortable and
 * filterable, including the archived ones the board keeps in a single lane.
 *
 * Sort and filter state persists, because a list you have to re-narrow every
 * time you open it is one you stop using.
 */

const STORE_KEY = 'specdeck.list';

/**
 * Filter value standing for "has no initiative".
 *
 * A named constant rather than a bare literal because both the filter and the
 * option that offers it must agree exactly, and an invisible difference between
 * them silently matches nothing. Initiative ids are kebab-case, so the brackets
 * cannot collide with a real one.
 */
export const UNLINKED = '(unlinked)';

export const COLUMNS = [
  { id: 'name', label: 'Change' },
  { id: 'root', label: 'Root' },
  { id: 'lane', label: 'Lane' },
  { id: 'progress', label: 'Tasks' },
  { id: 'approval', label: 'Approval' },
  { id: 'created', label: 'Created' },
  { id: 'lastModified', label: 'Modified' },
];

const LANE_ORDER = ['draft', 'proposed', 'specified', 'ready', 'in-progress', 'done', 'archived'];

const APPROVAL_ORDER = ['needs-review', 'never-approved', 'approved'];

const DEFAULTS = {
  sort: 'lastModified',
  direction: 'desc',
  archived: false,
  lanes: [],
  roots: [],
  initiatives: [],
  from: '',
  to: '',
};

export function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return Object.assign({}, DEFAULTS, saved);
  } catch {
    return Object.assign({}, DEFAULTS);
  }
}

export function savePreferences(prefs) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(prefs));
  } catch {
    // A browser with storage disabled loses the preference, not the list.
  }
}

/** True when any filter is narrowing the list. */
export function isFiltered(prefs) {
  return Boolean(
    prefs.lanes.length || prefs.roots.length || prefs.initiatives.length || prefs.from || prefs.to,
  );
}

export function applyFilters(changes, prefs) {
  return changes.filter(function (c) {
    if (!prefs.archived && c.archived) return false;
    if (prefs.lanes.length && prefs.lanes.indexOf(c.lane) === -1) return false;
    if (prefs.roots.length && prefs.roots.indexOf(c.rootPath) === -1) return false;
    if (prefs.initiatives.length) {
      // A change with no initiative is matched by the explicit "unlinked"
      // choice rather than by being quietly excluded.
      const key = c.initiative || UNLINKED;
      if (prefs.initiatives.indexOf(key) === -1) return false;
    }
    if (prefs.from && (!c.created || c.created < prefs.from)) return false;
    if (prefs.to && (!c.created || c.created > prefs.to + '￿')) return false;
    return true;
  });
}

/** The value a column sorts on, or undefined when the row has none. */
function sortValue(change, column) {
  if (column === 'name') return change.name.toLowerCase();
  if (column === 'root') return change.rootName.toLowerCase();
  if (column === 'lane') return LANE_ORDER.indexOf(change.lane);
  if (column === 'progress') {
    return change.tasksTotal > 0 ? change.tasksCompleted / change.tasksTotal : undefined;
  }
  if (column === 'approval') {
    const state = change.approval && change.approval.state;
    // 'unknown' has no place in the order: it is an absence, not a rank.
    if (!state || state === 'unknown') return undefined;
    return APPROVAL_ORDER.indexOf(state);
  }
  if (column === 'created') return change.created;
  if (column === 'lastModified') return change.lastModified;
  return undefined;
}

/**
 * Sorts, keeping rows with no value for the column together at the end.
 *
 * Treating a missing date as the epoch or a missing progress as zero would rank
 * "we do not know" alongside "it is genuinely zero", which are different facts
 * and would put the unknowns confidently at one end of the list.
 */
export function applySort(changes, prefs) {
  const withValue = [];
  const without = [];

  changes.forEach(function (c) {
    const value = sortValue(c, prefs.sort);
    if (value === undefined || value === null || value === '') without.push(c);
    else withValue.push({ c: c, v: value });
  });

  withValue.sort(function (a, b) {
    if (a.v < b.v) return -1;
    if (a.v > b.v) return 1;
    return a.c.name.localeCompare(b.c.name);
  });

  const sorted = withValue.map(function (e) {
    return e.c;
  });
  if (prefs.direction === 'desc') sorted.reverse();

  // The unknowns stay together at the end in both directions, rather than
  // flipping to the top and reading as the most recent or most complete.
  without.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });
  return sorted.concat(without);
}

/** Every distinct value a filter can offer, taken from the data itself. */
export function facets(changes) {
  const lanes = {};
  const roots = {};
  const initiatives = {};
  let unlinked = false;

  changes.forEach(function (c) {
    lanes[c.lane] = true;
    roots[c.rootPath] = c.rootName;
    if (c.initiative) initiatives[c.initiative] = true;
    else unlinked = true;
  });

  return {
    lanes: LANE_ORDER.filter(function (l) {
      return lanes[l];
    }),
    roots: Object.keys(roots).map(function (path) {
      return { path: path, name: roots[path] };
    }),
    initiatives: Object.keys(initiatives).sort(),
    hasUnlinked: unlinked,
  };
}
