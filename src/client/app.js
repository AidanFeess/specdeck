import {
  renderArtifactsTab,
  closeArtifactEditor,
  hasUnsavedEdit,
  discardEdit,
  resetEditing,
} from './artifacts.js';
import {
  COLUMNS,
  applyFilters,
  applySort,
  facets,
  isFiltered,
  loadPreferences,
  savePreferences,
  UNLINKED,
} from './list.js';
import { renderMarkdown } from './markdown.js';
import { createEditor } from './editor.js';

var LANES = ['draft', 'proposed', 'specified', 'ready', 'in-progress', 'done', 'archived'];
var LABELS = {
  draft: 'Draft',
  proposed: 'Proposed',
  specified: 'Specified',
  ready: 'Ready',
  'in-progress': 'In Progress',
  done: 'Done',
  archived: 'Archived',
};
var THEMES = ['auto', 'light', 'dark'];
var THEME_ICON = { auto: '\u25d0 Auto', light: '\u2600 Light', dark: '\u263e Dark' };

var state = null,
  selected = null,
  scannedAt = null,
  filterText = '',
  view = 'board';
var dragging = null,
  dragHint = null,
  historyByChange = null,
  taskHistory = {};
var dispatched = {};
var groupOverrides = {};
var activeTab = {};
var activeCapability = {};
/** OpenSpec validation results per change, fetched on demand. */
var validation = {};
/** Capabilities currently shown as whole documents rather than parsed. */
var capDocument = {};
/**
 * Rendered capability documents, keyed by path. Without this every render of
 * the specs view refetches every open document, including once per keystroke
 * in the filter box. Cleared whenever fresh state is adopted, so a document
 * that changed on disk is picked up on the next watcher event.
 */
var capDocCache = {};

/* Responses are adopted, not assigned. Guarding here keeps an error body or a
   stale in-flight response from wedging every render that follows. */
var loadSeq = 0;

/**
 * Adopts a server payload as the new state, but only when it actually is one.
 * A 500 answers with `{error}`, and assigning that would leave `state.project`
 * undefined and render() throwing until the page is reloaded.
 *
 * Adopting also invalidates every `/api/state` request still in flight: they
 * were computed before this payload, and applying one afterwards would snap
 * the interface back in time.
 */
function adoptState(s) {
  if (s && s.project) {
    state = s;
    loadSeq++;
    capDocCache = {};
    return true;
  }
  return false;
}

/**
 * Drops everything cached under a change name. Change names are only unique
 * within a project, so on a project switch a surviving cache would show one
 * project's history and validation against another project's change.
 */
function forgetProjectCaches() {
  historyByChange = null;
  taskHistory = {};
  dispatched = {};
  groupOverrides = {};
  activeTab = {};
  activeCapability = {};
  validation = {};
  capDocument = {};
  capDocCache = {};
}

function toast(message, isError) {
  var host = document.getElementById('toast');
  host.innerHTML = '';
  var box = el('div', 'toast' + (isError ? ' err' : ''), esc(message));
  host.appendChild(box);
  setTimeout(function () {
    if (host.firstChild === box) host.innerHTML = '';
  }, 4000);
}

try {
  groupOverrides = JSON.parse(localStorage.getItem('specdeck.groups') || '{}');
} catch {
  groupOverrides = {};
}

function saveGroups() {
  try {
    localStorage.setItem('specdeck.groups', JSON.stringify(groupOverrides));
  } catch {}
}

/* Theme: an explicit choice is stamped on the root so it beats the system
   preference in both directions. "auto" removes the attribute entirely. */
function currentTheme() {
  try {
    return localStorage.getItem('specdeck.theme') || 'auto';
  } catch {
    return 'auto';
  }
}
function applyTheme(name) {
  if (name === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', name);
  document.getElementById('themeBtn').textContent = THEME_ICON[name];
}
function cycleTheme() {
  var next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  try {
    localStorage.setItem('specdeck.theme', next);
  } catch {}
  applyTheme(next);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function el(tag, cls, html) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
/* Units change as the number grows, because "135h ago" is arithmetic the reader
   should not have to do. Past a month the exact figure stops being useful and
   the date itself is what someone wants. */
function ago(iso) {
  if (!iso) return 'never';
  var when = new Date(iso).getTime();
  if (isNaN(when)) return 'unknown';
  var s = Math.max(0, Math.round((Date.now() - when) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.round(s / 60) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  if (s < 2592000) return Math.round(s / 86400) + 'd ago';
  return 'on ' + new Date(iso).toISOString().slice(0, 10);
}
/* Scenario bodies are markdown bullets with a bold keyword. Printing them raw
   shows the reader the syntax instead of the sentence, so the keyword is set as
   a label and the asterisks go away. Anything that does not match the shape is
   shown as written rather than mangled. */
function scenarioBody(text) {
  var wrap = el('div', 'sbody');
  String(text == null ? '' : text)
    .split(/\r?\n/)
    .forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var row = el('div', 'sline');
      var parts = /^[-*]\s*\*\*([^*]+)\*\*\s*(.*)$/.exec(line);
      if (parts) {
        row.appendChild(el('b', 'skw', esc(parts[1])));
        row.appendChild(document.createTextNode(parts[2]));
      } else {
        row.appendChild(document.createTextNode(line.replace(/^[-*]\s*/, '')));
      }
      wrap.appendChild(row);
    });
  return wrap;
}

function issuesOf(change) {
  var all = (change.issues || []).slice();
  (change.deltaSpecs || []).forEach(function (d) {
    all = all.concat(d.issues || []);
  });
  return all.concat(change.tasks && change.tasks.issues ? change.tasks.issues : []);
}

/* A group is open unless the user said otherwise. Finished groups default to
   collapsed, so a long task list shows what is left rather than what is done. */
function groupKey(changeName, index) {
  return changeName + '#' + index;
}
function isGroupOpen(changeName, index, group) {
  var key = groupKey(changeName, index);
  if (Object.prototype.hasOwnProperty.call(groupOverrides, key)) return groupOverrides[key];
  var total = group.tasks.length;
  var done = group.tasks.filter(function (t) {
    return t.completed;
  }).length;
  return !(total > 0 && done === total);
}
function setGroupOpen(changeName, index, open) {
  groupOverrides[groupKey(changeName, index)] = open;
  saveGroups();
}

/* Every view is rebuilt wholesale on each update, which resets the scroll of
   anything that scrolls. While an agent is writing files this fires every few
   seconds, so a reader gets thrown back to the top constantly. Positions are
   captured before a rebuild and restored after, keyed by something stable
   across rebuilds rather than by element identity. */
function captureScroll() {
  var map = {};
  ['specs', 'list', 'home', 'setup', 'settings'].forEach(function (id) {
    var e = document.getElementById(id);
    if (e) map[id] = e.scrollTop;
  });
  // The board scrolls sideways. Losing that position on a rescan throws the
  // reader back to the first lane, which is the same fault as losing a vertical
  // position and happens just as often, since every file an agent writes
  // rebuilds the board.
  var board = document.getElementById('board');
  if (board) map.boardLeft = board.scrollLeft;
  // Lanes are keyed by their name, not their index, so adding or removing a
  // lane cannot shift positions onto the wrong column.
  [].slice.call(document.querySelectorAll('.lane')).forEach(function (lane) {
    var h = lane.querySelector('h2');
    var cards = lane.querySelector('.cards');
    if (h && cards) map['lane:' + h.textContent.replace(/[0-9]+$/, '')] = cards.scrollTop;
  });
  return map;
}

function restoreScroll(map) {
  if (!map) return;
  ['specs', 'list', 'home', 'setup', 'settings'].forEach(function (id) {
    var e = document.getElementById(id);
    if (e && map[id]) e.scrollTop = map[id];
  });
  var board = document.getElementById('board');
  if (board && map.boardLeft) board.scrollLeft = map.boardLeft;
  [].slice.call(document.querySelectorAll('.lane')).forEach(function (lane) {
    var h = lane.querySelector('h2');
    var cards = lane.querySelector('.cards');
    if (!h || !cards) return;
    var key = 'lane:' + h.textContent.replace(/[0-9]+$/, '');
    if (map[key]) cards.scrollTop = map[key];
  });
}

function clearProjectActions() {
  var bar = document.getElementById('pactions');
  if (bar) bar.innerHTML = '';
}

/* Switching views clears the filter. Carrying one across a switch is how a
   user ends up staring at an empty board wondering what broke. */
function switchView(next) {
  view = next;
  filterText = '';
  var box = document.getElementById('filter');
  if (box) box.value = '';
  render();
}

function goHome() {
  switchView('home');
}

function hideAllViews() {
  ['board', 'list', 'specs', 'setup', 'home', 'settings'].forEach(function (id) {
    document.getElementById(id).hidden = true;
  });
  document.getElementById('syncbar').hidden = true;
}

function render() {
  if (!state) return;
  var scroll = captureScroll();
  var res = state.project;
  document.getElementById('banners').innerHTML = '';

  document.getElementById('viewHome').className = view === 'home' ? 'on' : '';
  document.getElementById('viewSettings').className = view === 'settings' ? 'on' : '';
  document.getElementById('viewBoard').className = view === 'board' ? 'on' : '';
  document.getElementById('viewList').className = view === 'list' ? 'on' : '';
  document.getElementById('viewSpecs').className = view === 'specs' ? 'on' : '';

  if (view === 'settings') {
    hideAllViews();
    clearProjectActions();
    document.getElementById('settings').hidden = false;
    document.getElementById('pname').textContent = '';
    document.getElementById('counts').hidden = true;
    renderSettings();
    restoreScroll(scroll);
    tick();
    return;
  }

  // The list spans every registered root, so it does not depend on the open
  // project being readable and is handled before that check.
  if (view === 'list') {
    hideAllViews();
    clearProjectActions();
    document.getElementById('list').hidden = false;
    document.getElementById('pname').textContent = '';
    document.getElementById('counts').textContent = '';
    renderList();
    restoreScroll(scroll);
    tick();
    return;
  }

  if (view === 'home') {
    hideAllViews();
    clearProjectActions();
    document.getElementById('home').hidden = false;
    document.getElementById('pname').textContent = '';
    document.getElementById('counts').hidden = true;
    renderHome();
    restoreScroll(scroll);
    tick();
    return;
  }

  if (!res.ok) {
    // A pending open only makes sense against the root it was aimed at. If
    // that root failed to load, forgetting the request beats surprising the
    // user by jumping to a same-named change in some later project.
    pendingOpen = null;
    clearProjectActions();
    document.getElementById('pname').textContent = '';
    document.getElementById('counts').textContent = '';
    document.getElementById('board').innerHTML = '';
    document.getElementById('board').hidden = true;
    document.getElementById('specs').hidden = true;
    document.getElementById('syncbar').hidden = true;

    // A folder without OpenSpec is not an error, it is a folder that has not
    // started yet. Showing an error banner over an empty board would be both
    // discouraging and useless.
    if (res.failure.problem === 'not-openspec') {
      hideAllViews();
      renderSetup(res.failure);
      return;
    }

    document.getElementById('setup').hidden = true;
    banner('err', esc(res.failure.message));
    return;
  }
  document.getElementById('setup').hidden = true;

  var snap = res.snapshot;
  scannedAt = snap.scannedAt;

  // A row in the list can name a change in a different root. Switching roots is
  // asynchronous, so the request to open it is honoured once that root's state
  // has actually arrived.
  if (pendingOpen) {
    var wanted = snap.changes.filter(function (x) {
      return x.name === pendingOpen;
    })[0];
    pendingOpen = null;
    if (wanted) {
      // Naming it is enough: the tail of this render opens the panel for
      // whatever `selected` names.
      selected = wanted.name;
      view = 'board';
    }
  }
  document.getElementById('pname').textContent = snap.name;
  var badge = document.getElementById('ver');
  if (badge && state.version) badge.textContent = 'v' + state.version;
  document.getElementById('counts').textContent =
    snap.changes.length + ' changes \u00b7 ' + snap.capabilities.length + ' capabilities';

  if (state.openspec && state.openspec.status !== 'supported') {
    banner(state.openspec.usable ? 'warn' : 'err', esc(state.openspec.message));
  }

  renderSyncBar();
  renderProjectActions();

  var needle = filterText.toLowerCase();
  var board = document.getElementById('board');
  var specs = document.getElementById('specs');

  // Hide everything, then reveal exactly one view. Toggling views individually
  // is how a leftover screen ends up stacked under the current one.
  hideAllViews();
  document.getElementById('syncbar').hidden = false;
  if (view === 'specs') specs.hidden = false;
  else board.hidden = false;

  if (view === 'specs') {
    renderSpecs(snap, needle);
    restoreScroll(scroll);
    tick();
    return;
  }

  board.innerHTML = '';

  LANES.forEach(function (lane) {
    var inLane = snap.changes.filter(function (c) {
      return c.lane === lane && (!needle || c.name.toLowerCase().indexOf(needle) !== -1);
    });
    // Remote-only changes have no local files, so nothing derives a lane for
    // them. They sit in Draft as ghosts, because that is where an unstarted
    // change would be if you had it.
    var ghosts =
      lane === 'draft'
        ? (state.remoteOnly || []).filter(function (g) {
            return !needle || g.name.toLowerCase().indexOf(needle) !== -1;
          })
        : [];

    var col = el('div', 'lane');
    col.appendChild(
      el('h2', null, esc(LABELS[lane]) + '<b>' + (inLane.length + ghosts.length) + '</b>'),
    );
    var cards = el('div', 'cards');
    if (inLane.length === 0 && ghosts.length === 0) {
      cards.appendChild(el('div', 'empty', needle ? 'no match' : 'empty'));
    }
    inLane.forEach(function (c) {
      cards.appendChild(card(c));
    });
    ghosts.forEach(function (g) {
      cards.appendChild(ghostCard(g));
    });

    // The archive drop zone appears only while a finished change is being
    // dragged, because archiving is the one lane transition that is a real
    // filesystem mutation rather than a derived state.
    if (lane === 'archived') {
      var zone = el('div', 'drop', 'Drop here to archive');
      zone.hidden = true;
      zone.id = 'dropzone';
      zone.ondragover = function (e) {
        e.preventDefault();
      };
      zone.ondrop = function (e) {
        e.preventDefault();
        if (dragging) openArchive(dragging);
      };
      cards.appendChild(zone);
    }
    col.appendChild(cards);
    board.appendChild(col);
  });

  // A dispatch is cleared when the change actually moves, never on a timer.
  // A timer would mean shipping a board state whose truth condition is elapsed
  // seconds rather than anything on disk.
  snap.changes.forEach(function (c) {
    var sent = dispatched[c.name];
    if (sent && sent.lane !== undefined && sent.lane !== c.lane) delete dispatched[c.name];
    else if (sent && sent.lane === undefined) sent.lane = c.lane;
  });

  if (selected) {
    var still = snap.changes.filter(function (c) {
      return c.name === selected;
    })[0];
    if (still) openPanel(still);
    else closePanel();
  }
  restoreScroll(scroll);
  tick();
}

function banner(kind, html) {
  document.getElementById('banners').appendChild(el('div', 'banner ' + kind, html));
}

/* Sync indicators carry a glyph, a count, and a text tooltip, so nothing here
   depends on colour alone. */
function token(kind, glyph, count, title) {
  var t = el('span', 'tok ' + kind, glyph + ' ' + count);
  t.title = title;
  return t;
}

/* Remote state is a snapshot, so its age is permanent chrome rather than an
   occasional warning. An "in sync" claim is only as good as the last fetch. */
function renderSyncBar() {
  var bar = document.getElementById('syncbar');
  var sync = state && state.sync;
  if (!sync) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  bar.innerHTML = '';

  if (!sync.available) {
    bar.appendChild(el('span', null, esc(sync.reason || 'Sync state is unavailable.')));
    bar.appendChild(el('span', 'muted', 'No sync indicators are shown.'));
    return;
  }

  if (sync.branch) {
    bar.appendChild(
      el(
        'span',
        null,
        '<b>' +
          esc(sync.branch) +
          '</b>' +
          (sync.remoteRef ? ' \u2194 ' + esc(sync.remoteRef) : ''),
      ),
    );
  }

  if (sync.remoteRef) {
    var freshness = sync.neverFetched
      ? 'never fetched since clone'
      : 'fetched ' + ago(new Date(Date.now() - (sync.fetchAgeMs || 0)).toISOString());
    bar.appendChild(el('span', sync.neverFetched ? 'warnish' : null, esc(freshness)));
  } else if (sync.problem === 'no-remote-ref') {
    bar.appendChild(
      el('span', 'warnish', 'no remote branch resolved, so only uncommitted work is shown'),
    );
  }

  var counts = state.changeSync || {};
  var dirty = 0,
    ahead = 0,
    behind = 0;
  Object.keys(counts).forEach(function (k) {
    if (counts[k].uncommitted) dirty++;
    if (counts[k].ahead) ahead++;
    if (counts[k].behind) behind++;
  });
  var bits = [];
  if (dirty) bits.push(dirty + ' with uncommitted work');
  if (ahead) bits.push(ahead + ' not pushed');
  if (behind) bits.push(behind + ' with remote-only files');
  bar.appendChild(
    el('span', null, esc(bits.length ? bits.join(' \u00b7 ') : 'everything in sync')),
  );

  bar.appendChild(el('span', 'grow'));
  var refresh = el('button', 'icon', 'Refresh remote');
  refresh.onclick = function () {
    refresh.disabled = true;
    refresh.textContent = 'Fetching';
    fetch('/api/fetch', { method: 'POST' })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        adoptState(res.state);
        if (!res.ok) toast(res.message || 'Could not reach the remote.', true);
        render();
      })
      .catch(function () {
        toast('Could not reach specdeck.', true);
        render();
      });
  };
  bar.appendChild(refresh);
}

function card(c) {
  var n = el('div', 'card' + (c.name === selected ? ' active' : ''));
  n.appendChild(el('div', 'name', esc(c.name)));

  var bits = [];
  if (c.tasks && c.tasks.total > 0) bits.push(c.tasks.completed + '/' + c.tasks.total + ' tasks');
  var doneCount = (c.artifacts || []).filter(function (a) {
    return a.status === 'done';
  }).length;
  if (c.artifacts && c.artifacts.length)
    bits.push(doneCount + '/' + c.artifacts.length + ' artifacts');
  if (c.capabilities && c.capabilities.length) bits.push(c.capabilities.length + ' caps');
  if (c.archivedOn) bits.push(c.archivedOn);
  n.appendChild(el('div', 'meta', esc(bits.join(' \u00b7 '))));

  if (c.tasks && c.tasks.total > 0) {
    var bar = el('div', 'bar');
    var fill = el('i');
    fill.style.width = Math.round((100 * c.tasks.completed) / c.tasks.total) + '%';
    bar.appendChild(fill);
    n.appendChild(bar);
  }

  var approval = approvals[c.name];
  if (approval && approval.state !== 'unknown' && approval.state !== 'never-approved') {
    // Glyph and words, never colour alone. 'unknown' and 'never-approved'
    // render nothing at all: an indicator has to be earned, and "nobody has
    // approved this yet" is the ordinary state of most changes.
    var arow = el('div', 'sync');
    if (approval.state === 'approved') {
      var okTok = token('ok', '✓', '', 'approved');
      okTok.title = approval.latest
        ? 'Approved by ' + approval.latest.approver.name + ' ' + ago(approval.latest.approvedAt)
        : 'approved';
      arow.appendChild(okTok);
      arow.appendChild(el('span', 'muted', 'approved'));
      if (approval.latest) {
        arow.appendChild(
          el(
            'span',
            'faint',
            esc(approval.latest.approver.name + ' · ' + ago(approval.latest.approvedAt)),
          ),
        );
      }
    } else {
      var warnTok = token('warn', '●', String((approval.drift || []).length), 'needs review');
      warnTok.title =
        'Approved earlier, then ' +
        (approval.drift || []).length +
        ' file(s) changed: ' +
        (approval.drift || []).join(', ');
      arow.appendChild(warnTok);
      arow.appendChild(el('span', 'muted', 'needs review'));
    }
    n.appendChild(arow);
  }

  var sync = (state.changeSync || {})[c.name];
  if (sync && !sync.synced) {
    var row = el('div', 'sync');
    if (sync.uncommitted)
      row.appendChild(
        token(
          'uncommitted',
          '\u2022',
          sync.uncommitted,
          sync.uncommitted + ' file(s) written but not committed',
        ),
      );
    if (sync.ahead)
      row.appendChild(
        token('ahead', '\u2191', sync.ahead, sync.ahead + ' file(s) committed but not pushed'),
      );
    if (sync.behind)
      row.appendChild(
        token(
          'behind',
          '\u2193',
          sync.behind,
          sync.behind + ' file(s) on the remote that you do not have',
        ),
      );
    n.appendChild(row);
  }

  var sent = dispatched[c.name];
  if (sent) {
    var waiting = (c.artifacts || []).filter(function (a) {
      return a.status !== 'done';
    })[0];
    var note = el('div', 'flag');
    note.style.color = 'var(--accent)';
    note.innerHTML =
      esc('Handed off ' + ago(new Date(sent.at).toISOString()) + ' via ' + sent.method) +
      (waiting ? '<br><span class="muted">waiting for ' + esc(waiting.outputPath) + '</span>' : '');
    var clear = el('button', 'icon', 'Not running');
    clear.style.fontSize = '11px';
    clear.style.marginTop = '4px';
    clear.title = 'Clear this. specdeck never clears it on a timer.';
    clear.onclick = function (e) {
      e.stopPropagation();
      delete dispatched[c.name];
      render();
    };
    note.appendChild(document.createElement('br'));
    note.appendChild(clear);
    n.appendChild(note);
  }

  var iss = issuesOf(c);
  var errs = iss.filter(function (i) {
    return i.severity === 'error';
  }).length;
  var warns = iss.length - errs;
  if (errs) n.appendChild(el('div', 'flag err', errs + (errs === 1 ? ' problem' : ' problems')));
  else if (warns)
    n.appendChild(el('div', 'flag warn', warns + (warns === 1 ? ' warning' : ' warnings')));

  if (c.location !== 'archived') {
    var missing = (c.artifacts || [])
      .filter(function (a) {
        return a.status !== 'done';
      })
      .map(function (a) {
        return a.id;
      });
    var remaining = c.tasks ? c.tasks.total - c.tasks.completed : 0;
    var verb = missing.length ? 'propose' : remaining > 0 ? 'apply' : 'archive';
    var label = missing.length
      ? 'Write ' + missing[0]
      : remaining > 0
        ? 'Continue implementing'
        : 'Ready to archive';
    var act = el('button', 'act', esc(label));
    act.onclick = function (e) {
      e.stopPropagation();
      openHandoff(c, verb);
    };
    n.appendChild(act);
  }

  // Only a finished change can be dragged, and only onto Archive. Every other
  // lane is derived from files, so dragging there would be theatre.
  if (c.lane === 'done') {
    n.draggable = true;
    n.ondragstart = function () {
      dragging = c;
      n.classList.add('dragging');
      var zone = document.getElementById('dropzone');
      if (zone) zone.hidden = false;
    };
    n.ondragend = function () {
      dragging = null;
      n.classList.remove('dragging');
      var zone = document.getElementById('dropzone');
      if (zone) zone.hidden = true;
    };
  } else if (c.location !== 'archived') {
    // Teach once, rather than letting a dead drag feel broken. The card is
    // draggable purely so the attempt is observable; the drag itself is
    // cancelled and answered with the explanation.
    n.draggable = true;
    n.ondragstart = function (e) {
      e.preventDefault();
      if (dragHint) return;
      dragHint = c.lane;
      toast(
        'Lanes come from your files, so cards cannot be moved between them. A done change can be dragged to archive it.',
      );
    };
  }

  n.tabIndex = 0;
  n.setAttribute('role', 'button');
  var pick = function () {
    selected = c.name;
    render();
  };
  n.onclick = pick;
  n.onkeydown = function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick();
    }
  };
  return n;
}

function loadHistory(change) {
  // Same sentinel story as loadTaskHistory: one fetch out at a time.
  historyByChange = 'loading';
  fetch('/api/history')
    .then(function (r) {
      return r.json();
    })
    .then(function (res) {
      historyByChange = res;
      if (selected === change.name) openPanel(change);
    })
    .catch(function () {
      historyByChange = { available: false, reason: 'Could not read history.', changes: {} };
    });
}

function loadTaskHistory(change) {
  // The panel repaints on every watcher event, and each of these is a git
  // subprocess on the server. The sentinel keeps a repaint from starting a
  // second fetch while the first is still out.
  taskHistory[change.name] = 'loading';
  fetch('/api/history/tasks?change=' + encodeURIComponent(change.name))
    .then(function (r) {
      return r.json();
    })
    .then(function (res) {
      taskHistory[change.name] = res;
      if (selected === change.name) openPanel(change);
    })
    .catch(function () {
      taskHistory[change.name] = {
        available: false,
        reason: 'Could not read history.',
        events: [],
      };
    });
}

/* Archiving is the only destructive thing specdeck can do, and OpenSpec has no
   unarchive. So everything the interactive CLI would have asked is put in front
   of the user here instead, before anything runs. */
function openArchive(change) {
  var host = document.getElementById('modal');
  var back = el('div', 'modal');
  var sheet = el('div', 'sheet');
  sheet.appendChild(el('h3', null, 'Archive ' + esc(change.name)));
  sheet.appendChild(el('div', 'muted', 'Checking...'));
  back.appendChild(sheet);
  back.onclick = function (e) {
    if (e.target === back) host.innerHTML = '';
  };
  host.innerHTML = '';
  host.appendChild(back);

  fetch('/api/archive/preflight?change=' + encodeURIComponent(change.name))
    .then(function (r) {
      return r.json();
    })
    .then(function (pre) {
      sheet.innerHTML = '';
      sheet.appendChild(el('h3', null, 'Archive ' + esc(change.name)));
      sheet.appendChild(
        el(
          'div',
          'muted',
          'This merges its specs into openspec/specs and moves the change into the archive. ' +
            'OpenSpec has no unarchive, so git is the only way back.',
        ),
      );

      if (pre.incompleteTasks > 0) {
        sheet.appendChild(
          el(
            'div',
            'flag warn',
            esc(pre.incompleteTasks + ' of ' + pre.totalTasks + ' tasks are still unticked.'),
          ),
        );
      }
      if (pre.validationIssues && pre.validationIssues.length) {
        sheet.appendChild(el('div', 'flag err', 'Validation reported problems:'));
        pre.validationIssues.slice(0, 6).forEach(function (issue) {
          sheet.appendChild(el('div', 'flag err', esc(issue)));
        });
      }
      sheet.appendChild(el('pre', null, esc(pre.command)));

      var actions = el('div', 'actions');
      var cancel = el('button', null, 'Cancel');
      cancel.onclick = function () {
        host.innerHTML = '';
      };
      var copy = el('button', null, 'Copy command');
      copy.onclick = function () {
        navigator.clipboard.writeText(pre.command).then(
          function () {
            toast('Copied.');
          },
          function () {
            toast('Could not reach the clipboard.', true);
          },
        );
      };
      var go = el('button', 'act', pre.incompleteTasks > 0 ? 'Archive anyway' : 'Archive');
      go.style.width = 'auto';
      go.style.marginTop = '0';
      go.onclick = function () {
        go.disabled = true;
        go.textContent = 'Archiving';
        fetch('/api/archive', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ change: change.name }),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (res) {
            adoptState(res.state);
            host.innerHTML = '';
            selected = null;
            if (res.ok) toast(res.message);
            else showCommandFailure('The archive did not complete', res);
            render();
          })
          .catch(function () {
            host.innerHTML = '';
            toast('Could not reach specdeck.', true);
          });
      };
      actions.appendChild(cancel);
      actions.appendChild(copy);
      actions.appendChild(go);
      sheet.appendChild(actions);
    })
    .catch(function () {
      host.innerHTML = '';
      toast('Could not check this change.', true);
    });
}

/* Command failures show the command, the exit status, and the real output.
   A paraphrase would hide the one thing that lets someone fix it. */
function showCommandFailure(title, res) {
  var host = document.getElementById('modal');
  var back = el('div', 'modal');
  var sheet = el('div', 'sheet');
  sheet.appendChild(el('h3', null, esc(title)));
  if (res.message) sheet.appendChild(el('div', 'muted', esc(res.message)));
  // Newlines are built with fromCharCode rather than an escape sequence. This
  // file is one big template literal, and a backslash escape here has already
  // been mangled once into a literal line break that broke the whole client.
  var nl = String.fromCharCode(10);
  sheet.appendChild(
    el(
      'pre',
      null,
      esc(
        [
          res.command || '',
          '',
          'exit code ' + (res.exitCode === undefined ? '?' : res.exitCode),
          '',
          res.output || res.detail || 'no output',
        ].join(nl),
      ),
    ),
  );
  var actions = el('div', 'actions');
  var close = el('button', null, 'Close');
  close.onclick = function () {
    host.innerHTML = '';
  };
  actions.appendChild(close);
  sheet.appendChild(actions);
  back.appendChild(sheet);
  back.onclick = function (e) {
    if (e.target === back) host.innerHTML = '';
  };
  host.innerHTML = '';
  host.appendChild(back);
}

/* The editor picker.

   specdeck asks rather than guessing, because guessing is what produced the
   original fault: on a machine with no file association for markdown, the file
   was handed to the operating system, nothing appeared, and nothing was
   reported. */
function openFile(path) {
  fetch('/api/editor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: path }),
  })
    .then(function (r) {
      return r.json().then(function (b) {
        return { status: r.status, body: b };
      });
    })
    .then(function (res) {
      if (res.body.needsChoice) {
        askForEditor(path, null);
        return;
      }
      if (res.status === 200) {
        toast(res.body.message);
        return;
      }
      // A remembered application that no longer launches must not fail quietly.
      askForEditor(path, res.body);
    })
    .catch(function () {
      toast('Could not reach specdeck.', true);
    });
}

function baseNameOf(path) {
  return path.split(String.fromCharCode(92)).join('/').split('/').pop();
}

function askForEditor(path, failure) {
  fetch('/api/editors')
    .then(function (r) {
      return r.json();
    })
    .then(function (info) {
      var host = document.getElementById('modal');
      var back = el('div', 'modal');
      var sheet = el('div', 'sheet');

      sheet.appendChild(el('h3', null, 'Open with'));
      if (failure && failure.message) {
        sheet.appendChild(el('div', 'flag err', esc(failure.message)));
        if (failure.attempted) sheet.appendChild(el('pre', null, esc(failure.attempted)));
      }
      sheet.appendChild(el('div', 'muted', esc(baseNameOf(path))));

      var chosen = { command: null, system: false, label: null };
      var pills = el('div', 'pills');

      function select(button, next) {
        chosen = next;
        [].slice.call(pills.querySelectorAll('button')).forEach(function (x) {
          x.className = '';
        });
        if (button) button.className = 'on';
      }

      (info.editors || []).forEach(function (e) {
        var b = el('button', null, esc(e.label));
        b.title = e.command;
        b.onclick = function () {
          select(b, { command: e.command, system: false, label: e.label });
        };
        pills.appendChild(b);
      });

      var sys = el('button', null, 'System default');
      sys.title = 'Hand the file to your operating system';
      sys.onclick = function () {
        select(sys, { command: null, system: true, label: 'System default' });
      };
      pills.appendChild(sys);
      sheet.appendChild(pills);

      if (!(info.editors || []).length) {
        sheet.appendChild(
          el(
            'div',
            'muted',
            'specdeck found no known editor here. Type a command or a full path below.',
          ),
        );
      }

      var custom = document.createElement('input');
      custom.placeholder = 'or a command or path, for example code';
      custom.style.width = '100%';
      custom.style.marginTop = '10px';
      custom.oninput = function () {
        var value = custom.value.trim();
        if (value) select(null, { command: value, system: false, label: value });
      };
      sheet.appendChild(custom);

      var rememberWrap = el('label', 'tool');
      rememberWrap.style.marginTop = '10px';
      var remember = document.createElement('input');
      remember.type = 'checkbox';
      rememberWrap.appendChild(remember);
      rememberWrap.appendChild(el('span', null, 'Remember this choice'));
      rememberWrap.appendChild(el('span', 'muted', 'changeable in Settings'));
      sheet.appendChild(rememberWrap);

      var actions = el('div', 'actions');
      var cancel = el('button', null, 'Cancel');
      cancel.onclick = function () {
        host.innerHTML = '';
      };
      var go = el('button', 'act', 'Open');
      go.style.width = 'auto';
      go.style.marginTop = '0';
      go.onclick = function () {
        if (!chosen.command && !chosen.system) {
          toast('Pick an application first.', true);
          return;
        }
        var payload = { path: path, remember: remember.checked };
        if (chosen.system) payload.system = true;
        else payload.command = chosen.command;
        if (chosen.label) payload.label = chosen.label;

        fetch('/api/editor', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function (r) {
            return r.json().then(function (b) {
              return { status: r.status, body: b };
            });
          })
          .then(function (res) {
            if (res.status === 200) {
              host.innerHTML = '';
              toast(res.body.message + (remember.checked ? ' Remembered.' : ''));
              if (remember.checked) load();
            } else {
              // Stay open so another application can be picked immediately.
              askForEditor(path, res.body);
            }
          })
          .catch(function () {
            toast('Could not reach specdeck.', true);
          });
      };
      actions.appendChild(cancel);
      actions.appendChild(go);
      sheet.appendChild(actions);

      back.appendChild(sheet);
      back.onclick = function (e) {
        if (e.target === back) host.innerHTML = '';
      };
      host.innerHTML = '';
      host.appendChild(back);
    });
}

/* Settings. A preference that can only be changed by triggering the action it
   governs is one the user cannot undo. */
function renderSettings() {
  var host = document.getElementById('settings');
  host.innerHTML = '';
  var inner = el('div', 'inner');
  inner.appendChild(el('h2', null, 'Settings'));
  inner.appendChild(
    el('div', 'sub', 'These apply to specdeck itself. Nothing here is written into any project.'),
  );

  var remembered = state.config && state.config.defaults && state.config.defaults.editor;

  var editorRow = el('div', 'setrow');
  editorRow.appendChild(el('div', 'k', 'Open documents with'));
  var ev = el('div', 'v');
  ev.appendChild(
    el(
      'div',
      null,
      remembered
        ? esc(
            remembered.label ||
              (remembered.kind === 'system' ? 'System default' : remembered.command),
          )
        : 'Ask every time',
    ),
  );
  ev.appendChild(
    el(
      'div',
      'hint',
      remembered
        ? 'Used for every project. Clear it to be asked again.'
        : 'specdeck asks which application to use, and can remember your answer.',
    ),
  );

  var evActions = el('div', 'pills');
  var change = el('button', null, remembered ? 'Change' : 'Choose');
  change.onclick = function () {
    chooseEditorPreference();
  };
  evActions.appendChild(change);
  if (remembered) {
    var clear = el('button', null, 'Clear');
    clear.onclick = function () {
      fetch('/api/settings/editor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clear: true }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (s) {
          adoptState(s);
          toast('Cleared. specdeck will ask again.');
          render();
        });
    };
    evActions.appendChild(clear);
  }
  ev.appendChild(evActions);
  editorRow.appendChild(ev);
  inner.appendChild(editorRow);

  var handoffRow = el('div', 'setrow');
  handoffRow.appendChild(el('div', 'k', 'Handoff method'));
  var hv = el('div', 'v');
  var current =
    (state.config && state.config.defaults && state.config.defaults.handoffMethod) || 'auto';
  var hp = el('div', 'pills');
  [
    ['auto', 'Automatic'],
    ['attach', 'Send to a running session'],
    ['terminal', 'Open in a new terminal'],
    ['clipboard', 'Copy the prompt'],
  ].forEach(function (pair) {
    var b = el('button', current === pair[0] ? 'on' : null, esc(pair[1]));
    b.onclick = function () {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handoffMethod: pair[0], scope: 'global' }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (s) {
          adoptState(s);
          render();
        });
    };
    hp.appendChild(b);
  });
  hv.appendChild(hp);
  hv.appendChild(
    el(
      'div',
      'hint',
      'Anything specdeck cannot do for your tool falls back to copying, and says so.',
    ),
  );
  handoffRow.appendChild(hv);
  inner.appendChild(handoffRow);

  host.appendChild(inner);
}

/* Choosing a preference from settings, with no document to open yet. */
function chooseEditorPreference() {
  fetch('/api/editors')
    .then(function (r) {
      return r.json();
    })
    .then(function (info) {
      var host = document.getElementById('modal');
      var back = el('div', 'modal');
      var sheet = el('div', 'sheet');
      sheet.appendChild(el('h3', null, 'Open documents with'));
      sheet.appendChild(el('div', 'muted', 'Applies to every project. You can clear it later.'));

      function choose(payload, label) {
        fetch('/api/settings/editor', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (s) {
            adoptState(s);
            host.innerHTML = '';
            toast('Documents will open in ' + label + '.');
            render();
          });
      }

      var pills = el('div', 'pills');
      (info.editors || []).forEach(function (e) {
        var b = el('button', null, esc(e.label));
        b.title = e.command;
        b.onclick = function () {
          choose({ command: e.command, label: e.label }, e.label);
        };
        pills.appendChild(b);
      });
      var sys = el('button', null, 'System default');
      sys.onclick = function () {
        choose({ system: true }, 'your system default');
      };
      pills.appendChild(sys);
      sheet.appendChild(pills);

      var custom = document.createElement('input');
      custom.placeholder = 'or a command or path';
      custom.style.width = '100%';
      custom.style.marginTop = '10px';
      custom.onkeydown = function (e) {
        var value = custom.value.trim();
        if (e.key === 'Enter' && value) choose({ command: value, label: value }, value);
      };
      sheet.appendChild(custom);

      var actions = el('div', 'actions');
      var close = el('button', null, 'Cancel');
      close.onclick = function () {
        host.innerHTML = '';
      };
      actions.appendChild(close);
      sheet.appendChild(actions);

      back.appendChild(sheet);
      back.onclick = function (e) {
        if (e.target === back) host.innerHTML = '';
      };
      host.innerHTML = '';
      host.appendChild(back);
    });
}

/* The projects home. Overviews cost a full project read each, so they are
   fetched when this screen is opened rather than on every board render. */
var overviews = null;
/** Workspaces, context stores, and initiatives. Null until first fetched. */
var stores = null;
/** The cross-root change index behind the list view. Null until fetched. */
var changeIndex = null;
/** Sort and filter state for the list, restored from the last visit. */
var listPrefs = loadPreferences();
/** A change to open once its root has finished loading, set from the list. */
var pendingOpen = null;
/** Approval per change in the open project. Empty until fetched. */
var approvals = {};

var placements = [];
var projectSort = 'manual';
var draggingProject = null;
var dragPending = false;
/* A rearrangement rebuilds the grid, which throws away the focused card. The
   card that moved is refocused afterwards so a second key press keeps working. */
var pendingFocus = null;

try {
  var savedSort = localStorage.getItem('specdeck.projectSort');
  if (savedSort) projectSort = savedSort;
} catch {}

function saveSort(value) {
  projectSort = value;
  try {
    localStorage.setItem('specdeck.projectSort', value);
  } catch {}
}

function openProject(path) {
  fetch('/api/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: path }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (s) {
      if (!adoptState(s)) {
        toast((s && (s.message || s.error)) || 'Could not open that project.', true);
        return;
      }
      forgetProjectCaches();
      selected = null;
      initSelection = null;
      view = 'board';
      render();
    })
    .catch(function () {
      toast('Could not reach specdeck.', true);
    });
}

function loadOverviews() {
  fetch('/api/overview?sort=' + encodeURIComponent(projectSort))
    .then(function (r) {
      return r.json();
    })
    .then(function (res) {
      overviews = res.overviews;
      placements = res.placements || [];
      if (view === 'home') renderHome();
    });
}

function pickFolder(button) {
  var original = button.textContent;
  button.disabled = true;
  button.textContent = 'Choose a folder';
  fetch('/api/browse', { method: 'POST' })
    .then(function (r) {
      return r.json();
    })
    .then(function (res) {
      button.disabled = false;
      button.textContent = original;
      if (res.ok && adoptState(res.state)) {
        forgetProjectCaches();
        selected = null;
        initSelection = null;
        overviews = null;
        view = 'board';
        render();
        loadOverviews();
        return;
      }
      if (res.cancelled) return;
      if (res.unsupported) {
        promptForPath(res.message);
        return;
      }
      if (res.message) toast(res.message, true);
    })
    .catch(function () {
      button.disabled = false;
      button.textContent = original;
      promptForPath();
    });
}

/* Fallback for a machine with no native picker, so the feature degrades to
   typing a path rather than simply being unavailable. */
function promptForPath(reason) {
  var host = document.getElementById('modal');
  var back = el('div', 'modal');
  var sheet = el('div', 'sheet');
  sheet.appendChild(el('h3', null, 'Open a project folder'));
  sheet.appendChild(
    el(
      'div',
      'muted',
      esc(
        reason ||
          'specdeck could not open your system folder picker here, so type the path instead.',
      ),
    ),
  );

  var input = document.createElement('input');
  input.placeholder = 'C:/Projects/my-project';
  input.style.width = '100%';
  input.style.marginTop = '12px';
  sheet.appendChild(input);

  var actions = el('div', 'actions');
  var cancel = el('button', null, 'Cancel');
  cancel.onclick = function () {
    host.innerHTML = '';
  };
  var go = el('button', 'act', 'Open');
  go.style.width = 'auto';
  go.style.marginTop = '0';
  var submit = function () {
    var value = input.value.trim();
    if (!value) return;
    host.innerHTML = '';
    openProject(value);
  };
  go.onclick = submit;
  input.onkeydown = function (e) {
    if (e.key === 'Enter') submit();
  };
  actions.appendChild(cancel);
  actions.appendChild(go);
  sheet.appendChild(actions);

  back.appendChild(sheet);
  back.onclick = function (e) {
    if (e.target === back) host.innerHTML = '';
  };
  host.innerHTML = '';
  host.appendChild(back);
  input.focus();
}

var SORTS = [
  { id: 'manual', label: 'Manual' },
  { id: 'name', label: 'Name' },
  { id: 'activity', label: 'Activity' },
  { id: 'tasks', label: 'Tasks' },
];

function isStarred(path) {
  for (var i = 0; i < placements.length; i++) {
    if (placements[i].path === path) return placements[i].starred === true;
  }
  return false;
}

/* Starred projects are a block above the rest, so a move across that boundary
   cannot be honoured. Refusing it out loud beats a card that springs back. */
function sameGroup(a, b) {
  return isStarred(a) === isStarred(b);
}

function visibleProjects() {
  var needle = filterText.toLowerCase();
  if (!needle) return overviews;
  return overviews.filter(function (o) {
    return (
      o.name.toLowerCase().indexOf(needle) !== -1 || o.path.toLowerCase().indexOf(needle) !== -1
    );
  });
}

/* Rearranging is offered only when what you see is what you are arranging.
   Under a sort the arrangement would be overwritten on the next read, and under
   a filter the hidden projects have positions this list cannot speak for. */
function canRearrange() {
  return projectSort === 'manual' && !filterText;
}

function indexOfPath(list, path) {
  for (var i = 0; i < list.length; i++) if (list[i].path === path) return i;
  return -1;
}

function focusCard(path) {
  var nodes = document.getElementById('home').getElementsByClassName('pcard');
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].getAttribute('data-path') === path) {
      nodes[i].focus();
      return;
    }
  }
}

function clearDropHints() {
  var nodes = document.getElementById('home').getElementsByClassName('pcard');
  for (var i = 0; i < nodes.length; i++) {
    nodes[i].classList.remove('dropbefore');
    nodes[i].classList.remove('dropafter');
    nodes[i].classList.remove('nodrop');
  }
}

/* A control inside a card must not also trigger the card. The click is stopped
   where it is handled, and the key press here, because the card itself acts on
   Enter and Space. */
function isolate(button) {
  button.onkeydown = function (e) {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  };
  return button;
}

function sortControls() {
  var row = el('div', 'controls');
  row.appendChild(el('span', 'lbl', 'Sort'));

  var seg = el('span', 'seg');
  SORTS.forEach(function (s) {
    var b = el('button', projectSort === s.id ? 'on' : null, esc(s.label));
    b.onclick = function () {
      if (projectSort === s.id) return;
      saveSort(s.id);
      renderHome();
      loadOverviews();
    };
    seg.appendChild(b);
  });
  row.appendChild(seg);

  if (projectSort !== 'manual') {
    row.appendChild(el('span', 'lbl', 'Switch to Manual to rearrange.'));
  } else if (filterText) {
    row.appendChild(el('span', 'lbl', 'Clear the filter to rearrange.'));
  }
  return row;
}

function toggleStar(o, starred) {
  pendingFocus = o.path;
  fetch('/api/projects/star', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: o.path, starred: starred }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (res) {
      if (res && res.error) {
        toast(res.error, true);
        return;
      }
      // The server owns the ordering rule, so the list is read back rather than
      // rearranged here against a second copy of that rule.
      loadOverviews();
    })
    .catch(function () {
      toast('Could not save that.', true);
    });
}

/* The new arrangement is shown at once and saved behind it. The client already
   knows the resulting order, so reading every project again after a move would
   cost a full scan each for nothing new. */
function applyOrder(next, focusPath) {
  overviews = next;
  var paths = next.map(function (o) {
    return o.path;
  });

  placements = placements.slice();
  paths.forEach(function (path, index) {
    var found = false;
    for (var i = 0; i < placements.length; i++) {
      if (placements[i].path === path) {
        placements[i] = { path: path, starred: placements[i].starred, order: index };
        found = true;
      }
    }
    if (!found) placements.push({ path: path, order: index });
  });

  pendingFocus = focusPath || null;
  renderHome();

  fetch('/api/projects/order', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paths: paths }),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (res) {
      if (res && res.error) toast(res.error, true);
    })
    .catch(function () {
      toast('Could not save the new order.', true);
    });
}

function moveProject(path, delta) {
  if (!canRearrange()) return;
  var list = visibleProjects();
  var from = indexOfPath(list, path);
  var to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return;
  if (!sameGroup(list[from].path, list[to].path)) {
    toast('Starred projects always sit above the rest.');
    return;
  }
  var next = list.slice();
  next.splice(to, 0, next.splice(from, 1)[0]);
  applyOrder(next, path);
}

function dropProject(sourcePath, targetPath, after) {
  if (!canRearrange()) return;
  var list = visibleProjects();
  var from = indexOfPath(list, sourcePath);
  if (from < 0 || indexOfPath(list, targetPath) < 0) return;
  if (!sameGroup(sourcePath, targetPath)) {
    toast('Starred projects always sit above the rest.');
    return;
  }
  var next = list.slice();
  var moved = next.splice(from, 1)[0];
  next.splice(indexOfPath(next, targetPath) + (after ? 1 : 0), 0, moved);
  applyOrder(next, sourcePath);
}

function renderHome() {
  /* A rescan arriving mid drag would rebuild the grid out from under the
     pointer and cancel the drag. The rebuild waits for the drag to end. */
  if (draggingProject !== null) {
    dragPending = true;
    return;
  }

  var host = document.getElementById('home');
  host.innerHTML = '';

  var inner = el('div', 'inner');
  var top = el('div', 'top');
  top.appendChild(el('h2', null, 'Projects'));
  top.appendChild(el('span', 'grow'));

  var add = el('button', 'act', 'Open a project folder');
  add.style.width = 'auto';
  add.style.marginTop = '0';
  add.onclick = function () {
    pickFolder(add);
  };
  top.appendChild(add);

  var refresh = el('button', 'icon', 'Refresh');
  refresh.onclick = function () {
    overviews = null;
    renderHome();
    loadOverviews();
  };
  top.appendChild(refresh);
  inner.appendChild(top);

  inner.appendChild(
    el('div', 'sub', 'Every OpenSpec project you have opened. Click one to work in it.'),
  );

  if (overviews === null) {
    inner.appendChild(el('div', 'empty', 'Reading your projects...'));
    host.appendChild(inner);
    loadOverviews();
    return;
  }

  if (!overviews.length) {
    inner.appendChild(el('div', 'empty', 'No projects yet. Open a folder to get started.'));
    renderStores(inner);
    host.appendChild(inner);
    return;
  }

  inner.appendChild(sortControls());

  var shown = visibleProjects();
  if (!shown.length) {
    inner.appendChild(
      el(
        'div',
        'empty',
        'No project matches ' + esc(filterText) + '. Clear the filter to see them all.',
      ),
    );
    host.appendChild(inner);
    return;
  }

  var grid = el('div', 'grid');
  shown.forEach(function (o, index) {
    grid.appendChild(projectCard(o, index, shown));
  });
  inner.appendChild(grid);
  renderStores(inner);
  host.appendChild(inner);

  if (pendingFocus) {
    var target = pendingFocus;
    pendingFocus = null;
    focusCard(target);
  }
}

function projectCard(o, index, shown) {
  var starred = isStarred(o.path);
  var arrange = canRearrange() && shown.length > 1;
  var n = el(
    'div',
    'pcard' + (o.path === state.activeProject ? ' current' : '') + (arrange ? ' draggable' : ''),
  );
  n.setAttribute('data-path', o.path);

  var head = el('div', 'ptop');
  head.appendChild(el('div', 'pname', esc(o.name)));

  var star = isolate(el('button', 'star' + (starred ? ' on' : ''), starred ? '\u2605' : '\u2606'));
  star.title = starred
    ? 'Starred. Click to let it sort with the rest.'
    : 'Star this project to keep it on top.';
  star.setAttribute('aria-pressed', starred ? 'true' : 'false');
  star.setAttribute('aria-label', starred ? 'Unstar ' + o.name : 'Star ' + o.name);
  star.onclick = function (e) {
    e.stopPropagation();
    toggleStar(o, !starred);
  };
  head.appendChild(star);
  n.appendChild(head);

  n.appendChild(el('div', 'ppath', esc(o.path)));

  if (!o.ok) {
    n.appendChild(el('div', 'broken', esc(o.message || 'This project could not be read.')));
  } else {
    var stats = el('div', 'pstats');
    stats.appendChild(el('span', null, '<b>' + o.changes + '</b> changes'));
    stats.appendChild(el('span', null, '<b>' + o.capabilities + '</b> capabilities'));
    if (o.tasksTotal > 0) {
      stats.appendChild(
        el('span', null, '<b>' + o.tasksCompleted + '/' + o.tasksTotal + '</b> tasks'),
      );
    }
    n.appendChild(stats);

    var lanes = el('div', 'plane');
    LANES.forEach(function (l) {
      if (o.lanes[l]) lanes.appendChild(el('span', null, esc(LABELS[l]) + ' ' + o.lanes[l]));
    });
    if (lanes.childNodes.length) n.appendChild(lanes);

    var foot = el('div', 'pfoot');
    if (o.syncAvailable) {
      if (o.dirty)
        foot.appendChild(
          token('uncommitted', '\u2022', o.dirty, o.dirty + ' change(s) with uncommitted work'),
        );
      if (o.unpushed)
        foot.appendChild(
          token('ahead', '\u2191', o.unpushed, o.unpushed + ' change(s) not pushed'),
        );
      if (o.incoming)
        foot.appendChild(
          token('behind', '\u2193', o.incoming, o.incoming + ' file(s) waiting on the remote'),
        );
      if (!o.dirty && !o.unpushed && !o.incoming) foot.appendChild(el('span', 'muted', 'in sync'));
    } else {
      foot.appendChild(el('span', 'muted', 'no git'));
    }
    if (o.lastActivity) {
      foot.appendChild(el('span', 'muted', 'last commit ' + ago(o.lastActivity)));
    }
    if (foot.childNodes.length) n.appendChild(foot);
  }

  var footer = el('div', 'pfoot');

  if (arrange) {
    var move = el('div', 'move');
    var earlier = isolate(el('button', null, '\u2190'));
    earlier.title = 'Move earlier. Alt and Left does the same.';
    earlier.setAttribute('aria-label', 'Move ' + o.name + ' earlier');
    earlier.disabled = index === 0 || !sameGroup(o.path, shown[index - 1].path);
    earlier.onclick = function (e) {
      e.stopPropagation();
      moveProject(o.path, -1);
    };

    var later = isolate(el('button', null, '\u2192'));
    later.title = 'Move later. Alt and Right does the same.';
    later.setAttribute('aria-label', 'Move ' + o.name + ' later');
    later.disabled = index === shown.length - 1 || !sameGroup(o.path, shown[index + 1].path);
    later.onclick = function (e) {
      e.stopPropagation();
      moveProject(o.path, 1);
    };

    move.appendChild(earlier);
    move.appendChild(later);
    footer.appendChild(move);
  }

  var remove = isolate(el('button', 'remove', 'Remove'));
  remove.title = 'Forget this project. Nothing on disk is touched.';
  remove.onclick = function (e) {
    e.stopPropagation();
    fetch('/api/projects', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: o.path }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (s) {
        adoptState(s);
        overviews = overviews.filter(function (x) {
          return x.path !== o.path;
        });
        renderHome();
      });
  };
  footer.appendChild(remove);
  n.appendChild(footer);

  n.tabIndex = 0;
  n.setAttribute('role', 'button');
  n.onclick = function () {
    openProject(o.path);
  };
  n.onkeydown = function (e) {
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
      e.preventDefault();
      moveProject(o.path, -1);
      return;
    }
    if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveProject(o.path, 1);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openProject(o.path);
    }
  };

  if (arrange) {
    n.draggable = true;
    n.ondragstart = function (e) {
      draggingProject = o.path;
      dragPending = false;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        // Firefox starts no drag at all unless the transfer carries something.
        try {
          e.dataTransfer.setData('text/plain', o.path);
        } catch {}
      }
      n.classList.add('dragging');
    };
    n.ondragend = function () {
      draggingProject = null;
      n.classList.remove('dragging');
      clearDropHints();
      if (dragPending) {
        dragPending = false;
        renderHome();
      }
    };
    n.ondragover = function (e) {
      if (draggingProject === null || draggingProject === o.path) return;
      e.preventDefault();
      clearDropHints();

      // A drop that will be refused says so while the pointer is still moving,
      // rather than showing an insertion marker it has no intention of honouring.
      if (!sameGroup(draggingProject, o.path)) {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
        n.classList.add('nodrop');
        return;
      }

      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      // Which half of the card the pointer is over decides which side of it the
      // dragged project lands on, so the last position is reachable too.
      var box = n.getBoundingClientRect();
      n.classList.add(e.clientX - box.left > box.width / 2 ? 'dropafter' : 'dropbefore');
    };
    n.ondragleave = function () {
      n.classList.remove('dropbefore');
      n.classList.remove('dropafter');
      n.classList.remove('nodrop');
    };
    n.ondrop = function (e) {
      e.preventDefault();
      // The board's own drop handler would otherwise explain that lanes cannot
      // be reordered, which has nothing to do with this.
      e.stopPropagation();
      var source = draggingProject;
      draggingProject = null;
      clearDropHints();
      if (!source || source === o.path) return;
      var box = n.getBoundingClientRect();
      dropProject(source, o.path, e.clientX - box.left > box.width / 2);
    };
  }
  return n;
}

/* The first-run view: a folder with no OpenSpec in it yet.
   Both affordances are offered deliberately. Some people want the button, and
   some want to see and run the command themselves, which is also the escape
   hatch when the button fails. */
var initSelection = null;

function renderSetup(failure) {
  var host = document.getElementById('setup');
  host.hidden = false;
  host.innerHTML = '';

  var tools = state.initTools || [];
  if (initSelection === null) {
    initSelection = {};
    tools.forEach(function (t) {
      if (t.detected) initSelection[t.id] = true;
    });
  }

  var inner = el('div', 'inner');
  inner.appendChild(el('h2', null, 'No OpenSpec here yet'));
  inner.appendChild(el('div', 'path', esc(state.activeProject)));
  inner.appendChild(
    el(
      'div',
      'muted',
      'Pick the AI tools you use in this project. OpenSpec writes its workflow files for each one, ' +
        'and specdeck uses those to hand work off later. You can change this later by running the ' +
        'command again.',
    ),
  );

  var grid = el('div', 'tools');
  grid.style.marginTop = '14px';
  tools.forEach(function (t) {
    var label = el('label', 'tool');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!initSelection[t.id];
    box.onchange = function () {
      initSelection[t.id] = box.checked;
      renderSetup(failure);
    };
    label.appendChild(box);
    label.appendChild(el('span', null, esc(t.label)));
    if (t.detected) label.appendChild(el('span', 'found', 'found'));
    if (t.writesOutsideProject) {
      label.appendChild(el('span', 'warnflag', 'writes to your home folder'));
      label.title = 'This tool keeps its commands outside the project, in your home directory.';
    }
    grid.appendChild(label);
  });
  inner.appendChild(grid);

  var chosen = tools
    .filter(function (t) {
      return initSelection[t.id];
    })
    .map(function (t) {
      return t.id;
    });
  var outside = tools.filter(function (t) {
    return initSelection[t.id] && t.writesOutsideProject;
  });

  inner.appendChild(
    el('pre', null, esc('openspec init . --tools ' + (chosen.length ? chosen.join(',') : 'none'))),
  );

  if (outside.length) {
    inner.appendChild(
      el(
        'div',
        'flag warn',
        esc(
          outside
            .map(function (t) {
              return t.label;
            })
            .join(', '),
        ) + ' keeps its files outside this folder, in your home directory.',
      ),
    );
  }

  var go = el('div', 'go');
  var run = el('button', 'act', 'Initialize OpenSpec here');
  run.style.width = 'auto';
  run.onclick = function () {
    run.disabled = true;
    run.textContent = 'Initializing';
    fetch('/api/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tools: chosen }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        adoptState(res.state);
        if (res.ok) {
          initSelection = null;
          toast(res.message);
        } else showInitFailure(res);
        render();
      })
      .catch(function () {
        toast('Could not reach specdeck.', true);
        render();
      });
  };
  var copy = el('button', null, 'Copy command');
  copy.onclick = function () {
    var cmd = 'openspec init . --tools ' + (chosen.length ? chosen.join(',') : 'none');
    navigator.clipboard.writeText(cmd).then(
      function () {
        toast('Copied. Run it in ' + state.activeProject);
      },
      function () {
        toast('Could not reach the clipboard.', true);
      },
    );
  };
  go.appendChild(run);
  go.appendChild(copy);
  go.appendChild(el('span', 'muted', 'or run it yourself, either works'));
  inner.appendChild(go);

  host.appendChild(inner);
}

function showInitFailure(res) {
  var host = document.getElementById('modal');
  var back = el('div', 'modal');
  var sheet = el('div', 'sheet');
  sheet.appendChild(el('h3', null, 'Initialization did not complete'));
  sheet.appendChild(el('div', 'muted', esc(res.message)));
  sheet.appendChild(
    el(
      'pre',
      null,
      esc(res.command + '\n\nexit code ' + res.exitCode + '\n\n' + (res.output || 'no output')),
    ),
  );
  var actions = el('div', 'actions');
  var close = el('button', null, 'Close');
  close.onclick = function () {
    host.innerHTML = '';
  };
  actions.appendChild(close);
  sheet.appendChild(actions);
  back.appendChild(sheet);
  back.onclick = function (e) {
    if (e.target === back) host.innerHTML = '';
  };
  host.innerHTML = '';
  host.appendChild(back);
}

/* A change someone else has pushed that this checkout does not have. There is
   no local directory to read, so all specdeck can honestly show is that it
   exists and how to get it. */
function ghostCard(g) {
  var n = el('div', 'card ghost');
  n.appendChild(el('div', 'name', esc(g.name)));
  n.appendChild(
    el(
      'div',
      'meta',
      'on ' + esc((state.sync && state.sync.remoteRef) || 'the remote') + ', not in your checkout',
    ),
  );
  var row = el('div', 'sync');
  row.appendChild(token('behind', '\u2193', g.fileCount, g.fileCount + ' file(s) you do not have'));
  n.appendChild(row);

  var pull = el('button', 'act', 'Pull this into your checkout');
  pull.onclick = function (e) {
    e.stopPropagation();
    openPull(g);
  };
  n.appendChild(pull);

  n.tabIndex = 0;
  n.setAttribute('role', 'button');
  n.onclick = function () {
    openPull(g);
  };
  n.onkeydown = function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPull(g);
    }
  };
  return n;
}

/* Pulling affects the whole branch, not just the change whose card was clicked,
   so the sheet says so before anything runs. */
function openPull(g) {
  var host = document.getElementById('modal');
  var back = el('div', 'modal');
  var sheet = el('div', 'sheet');

  sheet.appendChild(el('h3', null, 'Pull ' + esc(g.name)));
  sheet.appendChild(
    el(
      'div',
      'muted',
      'This brings your whole branch up to date with ' +
        esc((state.sync && state.sync.remoteRef) || 'the remote') +
        ', not just this change. specdeck only fast-forwards, so if your branch has moved too it ' +
        'will stop and tell you rather than creating a merge.',
    ),
  );
  sheet.appendChild(el('pre', null, 'git pull --ff-only'));

  var actions = el('div', 'actions');
  var copy = el('button', null, 'Copy command');
  copy.onclick = function () {
    navigator.clipboard.writeText('git pull --ff-only').then(
      function () {
        toast('Copied.');
      },
      function () {
        toast('Could not reach the clipboard.', true);
      },
    );
  };
  var cancel = el('button', null, 'Cancel');
  cancel.onclick = function () {
    host.innerHTML = '';
  };
  var go = el('button', 'act', 'Pull');
  go.style.width = 'auto';
  go.style.marginTop = '0';
  go.onclick = function () {
    go.disabled = true;
    go.textContent = 'Pulling';
    fetch('/api/pull', { method: 'POST' })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        adoptState(res.state);
        host.innerHTML = '';
        if (res.ok) toast(res.message || 'Pulled.');
        else showPullFailure(res);
        render();
      })
      .catch(function () {
        host.innerHTML = '';
        toast('Could not reach specdeck.', true);
      });
  };

  actions.appendChild(cancel);
  actions.appendChild(copy);
  actions.appendChild(go);
  sheet.appendChild(actions);

  back.appendChild(sheet);
  back.onclick = function (e) {
    if (e.target === back) host.innerHTML = '';
  };
  host.innerHTML = '';
  host.appendChild(back);
}

/* A failed pull shows git's own output. Paraphrasing it would hide the one
   piece of information that lets someone fix it. */
function showPullFailure(res) {
  var host = document.getElementById('modal');
  var back = el('div', 'modal');
  var sheet = el('div', 'sheet');
  sheet.appendChild(el('h3', null, 'The pull did not run'));
  sheet.appendChild(el('div', 'muted', esc(res.message)));
  if (res.detail) sheet.appendChild(el('pre', null, esc(res.detail)));
  var actions = el('div', 'actions');
  var close = el('button', null, 'Close');
  close.onclick = function () {
    host.innerHTML = '';
  };
  actions.appendChild(close);
  sheet.appendChild(actions);
  back.appendChild(sheet);
  back.onclick = function (e) {
    if (e.target === back) host.innerHTML = '';
  };
  host.innerHTML = '';
  host.appendChild(back);
}

/* Capabilities as OpenSpec has accumulated them, with the changes that touch
   each one. A capability a change introduces does not exist here until that
   change is archived, so those are listed separately rather than hidden. */
function renderSpecs(snap, needle) {
  var host = document.getElementById('specs');
  host.innerHTML = '';

  var known = {};
  snap.capabilities.forEach(function (cap) {
    known[cap.id] = true;
  });

  var pending = {};
  snap.changes.forEach(function (c) {
    (c.capabilities || []).forEach(function (id) {
      if (!known[id]) {
        pending[id] = pending[id] || [];
        pending[id].push(c.name);
      }
    });
  });

  var matches = snap.capabilities.filter(function (cap) {
    return !needle || cap.id.toLowerCase().indexOf(needle) !== -1;
  });

  if (!matches.length && !Object.keys(pending).length) {
    host.appendChild(
      el('div', 'empty', 'No capabilities yet. They appear here once a change is archived.'),
    );
    return;
  }

  matches.forEach(function (cap) {
    var box = el('div', 'cap');

    var caphead = el('div', 'caphead');
    caphead.appendChild(el('h3', null, esc(cap.id)));
    caphead.appendChild(el('div', 'grow'));

    // The same reader the change artifacts use, pointed at the accumulated
    // spec. A capability is a document too, and reading it as one is often
    // easier than reading the parsed requirements below.
    var whole = el('button', 'icon', capDocument[cap.id] ? 'Requirements' : 'Document');
    whole.onclick = function () {
      capDocument[cap.id] = !capDocument[cap.id];
      render();
    };
    caphead.appendChild(whole);
    box.appendChild(caphead);

    if (capDocument[cap.id]) {
      var doc = el('div', 'fdoc');
      box.appendChild(doc);
      var cached = capDocCache[cap.path];
      if (cached && cached !== 'loading') {
        doc.innerHTML = cached.html;
        host.appendChild(box);
        return;
      }
      doc.appendChild(el('div', 'muted', 'Loading…'));
      if (cached !== 'loading') {
        capDocCache[cap.path] = 'loading';
        fetch('/api/artifact?path=' + encodeURIComponent(cap.path))
          .then(function (r) {
            return r.json();
          })
          .then(function (result) {
            capDocCache[cap.path] = {
              html: result.ok
                ? renderMarkdown(result.artifact.text)
                : esc(result.message || 'That file could not be read.'),
            };
            if (view === 'specs') render();
          })
          .catch(function () {
            capDocCache[cap.path] = { html: esc('Could not reach specdeck.') };
            if (view === 'specs') render();
          });
      }
      host.appendChild(box);
      return;
    }

    if (cap.purpose) box.appendChild(el('div', 'purpose', esc(cap.purpose)));
    var users = snap.changes.filter(function (c) {
      return (c.capabilities || []).indexOf(cap.id) !== -1;
    });
    if (users.length) {
      box.appendChild(
        el(
          'div',
          'used',
          'Changed by ' +
            esc(
              users
                .map(function (c) {
                  return c.name;
                })
                .join(', '),
            ),
        ),
      );
    }
    cap.requirements.forEach(function (r) {
      var req = el('div', 'req');
      req.appendChild(el('div', 'rname', esc(r.name)));
      if (r.text) req.appendChild(el('div', 'rtext', esc(r.text)));
      r.scenarios.forEach(function (sc) {
        var w = el('div', 'scn');
        w.appendChild(el('div', 'sname', esc(sc.name)));
        w.appendChild(scenarioBody(sc.body));
        req.appendChild(w);
      });
      box.appendChild(req);
    });
    if (!cap.requirements.length) box.appendChild(el('div', 'empty', 'No requirements.'));
    host.appendChild(box);
  });

  var pendingIds = Object.keys(pending)
    .filter(function (id) {
      return !needle || id.toLowerCase().indexOf(needle) !== -1;
    })
    .sort();
  if (pendingIds.length) {
    var note = el('div', 'cap');
    note.appendChild(el('h3', null, 'Not created yet'));
    note.appendChild(
      el(
        'div',
        'purpose',
        'These capabilities are proposed by active changes and become specs once those changes are archived.',
      ),
    );
    pendingIds.forEach(function (id) {
      note.appendChild(el('div', 'used', esc(id) + ' \u00b7 from ' + esc(pending[id].join(', '))));
    });
    host.appendChild(note);
  }
}

function copyPayload(payload) {
  navigator.clipboard.writeText(payload).then(
    function () {
      toast('Copied. Paste it into your agent.');
    },
    function () {
      toast('Could not reach the clipboard.', true);
    },
  );
}

/* The payload is always copied first, whatever method is used. Even the session
   and terminal paths only open a place to paste, because there is no verified
   way to push a message into a running conversation. */
function runDispatch(change, verb, payload, method, sessionId) {
  copyPayload(payload);
  var harness =
    (
      (state.harnesses || []).filter(function (h) {
        return h.state === 'configured';
      })[0] || {}
    ).id || '';

  var body = { harness: harness, method: method };
  if (sessionId) body.session = sessionId;

  fetch('/api/handoff', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(function (r) {
      return r.json();
    })
    .then(function (res) {
      document.getElementById('modal').innerHTML = '';
      // Always says which method was actually used, including on success, so a
      // silent fall through is still visible.
      toast(res.message, !res.ok);
      if (!res.ok && res.detail) showCommandFailure('Handoff did not complete', res);
      if (res.ok && res.method !== 'clipboard') {
        dispatched[change.name] = { method: res.method, verb: verb, at: Date.now() };
        render();
      }
    })
    .catch(function () {
      toast('Could not reach specdeck.', true);
    });
}

function openHandoff(change, verb) {
  var harnesses = (state && state.harnesses) || [];
  var configured = harnesses.filter(function (h) {
    return h.state === 'configured';
  })[0];
  var command = null;
  if (configured) {
    for (var i = 0; i < configured.commands.length; i++) {
      if (configured.commands[i].indexOf(verb) !== -1) {
        command = configured.commands[i];
        break;
      }
    }
  }
  var payload = command
    ? command + ' ' + change.name
    : 'Work on the OpenSpec change "' +
      change.name +
      '": run openspec status --change ' +
      change.name +
      ' --json, then follow the ' +
      verb +
      ' workflow.';

  var note = configured
    ? command
      ? configured.label + ' has this workflow. Run the command in your session.'
      : configured.label +
        ' is set up for OpenSpec but has no generated "' +
        verb +
        '" command. Paste this instead.'
    : 'No AI tool is wired into OpenSpec here. Paste this into whichever agent you use.';

  var host = document.getElementById('modal');
  var back = el('div', 'modal');
  var sheet = el('div', 'sheet');
  sheet.appendChild(el('h3', null, 'Hand off ' + esc(change.name)));
  sheet.appendChild(el('div', 'muted', esc(note)));
  sheet.appendChild(el('pre', null, esc(payload)));

  var sessions = state.sessions || [];
  var current =
    (state.config && state.config.defaults && state.config.defaults.handoffMethod) || 'auto';

  // A method with no running session, or no known terminal command, is a
  // capability gap. Those options are simply not offered rather than shown
  // broken.
  var options = [['auto', 'Automatic']];
  if (sessions.length) options.push(['attach', 'Send to a running session']);
  options.push(['terminal', 'Open in a new terminal']);
  options.push(['clipboard', 'Copy the prompt']);

  var methods = el('div', 'pills');
  options.forEach(function (pair) {
    var b = el('button', current === pair[0] ? 'on' : null, esc(pair[1]));
    b.title = 'How specdeck should hand work to your agent';
    b.onclick = function () {
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handoffMethod: pair[0], scope: 'global' }),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (s) {
          adoptState(s);
          openHandoff(change, verb);
        });
    };
    methods.appendChild(b);
  });
  sheet.appendChild(methods);

  if (sessions.length) {
    var list = el('div', 'pills');
    sessions.slice(0, 4).forEach(function (s) {
      var b = el('button', null, esc(s.name || s.id.slice(0, 8)));
      b.title = 'Open this running session. The prompt is copied, not sent.';
      b.onclick = function () {
        runDispatch(change, verb, payload, 'attach', s.id);
      };
      list.appendChild(b);
    });
    sheet.appendChild(list);
  }

  var actions = el('div', 'actions');
  var cancel = el('button', null, 'Close');
  cancel.onclick = function () {
    host.innerHTML = '';
  };
  var copy = el('button', null, 'Copy only');
  copy.onclick = function () {
    copyPayload(payload);
    host.innerHTML = '';
  };
  var send = el('button', 'act', 'Hand off');
  send.style.width = 'auto';
  send.style.marginTop = '0';
  send.onclick = function () {
    runDispatch(change, verb, payload, current, sessions.length ? sessions[0].id : null);
  };
  actions.appendChild(cancel);
  actions.appendChild(copy);
  actions.appendChild(send);
  sheet.appendChild(actions);

  back.appendChild(sheet);
  back.onclick = function (e) {
    if (e.target === back) host.innerHTML = '';
  };
  host.innerHTML = '';
  host.appendChild(back);
}

function openPanel(c) {
  var panel = document.getElementById('panel');

  // The scrolling element is .abody, not the aside. The aside became a flex
  // column with a fixed header and tab strip when the tabs were stopped from
  // scrolling, which silently moved the scroll to its body. Reading the aside
  // here always returned 0, so every rescan threw the reader back to the top,
  // which is unbearable while an agent is writing files every few seconds.
  var previousBody = panel.querySelector('.abody');
  var scrollTop = previousBody ? previousBody.scrollTop : 0;

  var a = el('aside');

  var head = el('div', 'ahead');
  var titles = el('div');
  titles.appendChild(el('h2', null, esc(c.name)));
  titles.appendChild(el('div', 'muted', esc(LABELS[c.lane]) + ' \u00b7 ' + esc(c.metadata.schema)));
  head.appendChild(titles);
  head.appendChild(el('div', 'grow'));
  var close = el('button', 'icon', '\u2715');
  close.title = 'Close (Esc)';
  close.onclick = closePanel;
  head.appendChild(close);
  a.appendChild(head);

  var iss = issuesOf(c);

  /* One tab per section, plus one per capability the change touches. Keeping a
     capability's requirements on their own tab is the difference between
     reading a spec and scrolling past it. */
  var groupStats = taskGroupStats(c);
  var reqTotal = (c.deltaSpecs || []).reduce(function (n, d) {
    return n + d.requirements.length;
  }, 0);

  var tabs = [{ id: 'overview', label: 'Overview' }];
  if (c.tasks && c.tasks.total > 0) {
    tabs.push({ id: 'tasks', label: 'Tasks', count: c.tasks.completed + '/' + c.tasks.total });
  }
  if ((c.deltaSpecs || []).length) {
    tabs.push({ id: 'specs', label: 'Specs', count: String(reqTotal) });
  }
  // Driven by the schema rather than by filenames: whatever artifacts this
  // change's workflow declares are the ones that can be read here.
  var fileCount = (c.artifacts || []).reduce(function (n, a) {
    return n + (a.existingPaths || []).length;
  }, 0);
  if ((c.artifacts || []).length) {
    tabs.push({ id: 'files', label: 'Files', count: String(fileCount) });
  }
  tabs.push({ id: 'timeline', label: 'Timeline' });
  // Always present now: it is where validation is run from, so it has to be
  // reachable for a change that currently has nothing wrong with it.
  tabs.push(
    iss.length
      ? { id: 'problems', label: 'Problems', count: String(iss.length) }
      : { id: 'problems', label: 'Problems' },
  );

  var active = activeTab[c.name];
  if (
    !active ||
    !tabs.some(function (t) {
      return t.id === active;
    })
  )
    active = tabs[0].id;

  var strip = el('div', 'tabs');
  tabs.forEach(function (t) {
    var b = el(
      'button',
      t.id === active ? 'on' : null,
      esc(t.label) + (t.count ? '<span class="n">' + esc(t.count) + '</span>' : ''),
    );
    b.onclick = function () {
      activeTab[c.name] = t.id;
      openPanel(c);
    };
    strip.appendChild(b);
  });
  a.appendChild(strip);

  var body = el('div', 'abody');

  if (active === 'overview') {
    body.appendChild(el('h3', null, 'Details'));
    if (c.metadata.created)
      body.appendChild(
        el('div', 'row', '<b>Created</b><span>' + esc(c.metadata.created) + '</span>'),
      );
    if (c.archivedOn)
      body.appendChild(el('div', 'row', '<b>Archived</b><span>' + esc(c.archivedOn) + '</span>'));
    body.appendChild(el('div', 'row', '<b>Schema</b><span>' + esc(c.metadata.schema) + '</span>'));
    if (c.capabilities && c.capabilities.length) {
      body.appendChild(
        el('div', 'row', '<b>Capabilities</b><span>' + esc(c.capabilities.join(', ')) + '</span>'),
      );
    }
    body.appendChild(el('div', 'row', '<b>Folder</b><code>' + esc(c.dir) + '</code>'));
    body.appendChild(initiativeRow(c));

    body.appendChild(el('h3', null, 'Artifacts'));
    (c.artifacts || []).forEach(function (x) {
      var row = el('div', 'art');
      row.appendChild(el('span', 'aname', esc(x.id)));
      var extra =
        x.status === 'blocked' && x.missingDeps.length
          ? ' waiting on ' + x.missingDeps.join(', ')
          : '';
      row.appendChild(el('span', 'muted', esc(x.status + extra)));

      // Per-artifact sync state, which the card rolls up to a count.
      var fileState = (state.sync && state.sync.files) || {};
      (x.existingPaths || []).forEach(function (abs) {
        var key = Object.keys(fileState).filter(function (rel) {
          return abs.split(String.fromCharCode(92)).join('/').indexOf(rel) !== -1;
        })[0];
        if (!key) return;
        var kind = fileState[key];
        var glyph = kind === 'uncommitted' ? '•' : kind === 'ahead' ? '↑' : '↓';
        row.appendChild(token(kind, glyph, '', kind));
      });

      row.appendChild(el('span', 'grow2'));
      if (x.existingPaths && x.existingPaths.length) {
        var open = el('button', 'icon', 'Open');
        open.title = 'Open in your editor';
        open.onclick = function () {
          openFile(x.existingPaths[0]);
        };
        row.appendChild(open);
      }
      body.appendChild(row);
    });
    if (!c.artifacts || !c.artifacts.length)
      body.appendChild(el('div', 'empty', 'No schema resolved.'));
  }

  if (active === 'tasks' && c.tasks) {
    var stats = el('div', 'stats');
    stats.appendChild(statBox('Task groups', groupStats.done, groupStats.total));
    stats.appendChild(statBox('Tasks', c.tasks.completed, c.tasks.total));
    body.appendChild(stats);

    var th = el('h3', null, 'Breakdown');
    th.style.display = 'flex';
    th.style.alignItems = 'center';
    th.style.gap = '8px';
    th.appendChild(el('span', 'grow'));
    var expandAll = el('button', 'icon', 'Expand all');
    expandAll.style.textTransform = 'none';
    expandAll.style.letterSpacing = '0';
    expandAll.onclick = function () {
      setAllGroups(c, true);
    };
    var collapseAll = el('button', 'icon', 'Collapse all');
    collapseAll.style.textTransform = 'none';
    collapseAll.style.letterSpacing = '0';
    collapseAll.onclick = function () {
      setAllGroups(c, false);
    };
    th.appendChild(expandAll);
    th.appendChild(collapseAll);
    body.appendChild(th);

    c.tasks.groups.forEach(function (g, index) {
      body.appendChild(taskGroup(c, g, index));
    });
  }

  if (active === 'specs') {
    var specs = c.deltaSpecs || [];
    var chosen = activeCapability[c.name];
    if (
      chosen &&
      !specs.some(function (d) {
        return d.capability === chosen;
      })
    )
      chosen = null;

    var pills = el('div', 'pills');
    var all = el('button', chosen ? null : 'on', 'All<span class="n">' + specs.length + '</span>');
    all.onclick = function () {
      activeCapability[c.name] = null;
      openPanel(c);
    };
    pills.appendChild(all);
    specs.forEach(function (d) {
      var b = el(
        'button',
        chosen === d.capability ? 'on' : null,
        esc(d.capability) + '<span class="n">' + d.requirements.length + '</span>',
      );
      b.onclick = function () {
        activeCapability[c.name] = d.capability;
        openPanel(c);
      };
      pills.appendChild(b);
    });
    body.appendChild(pills);

    specs
      .filter(function (d) {
        return !chosen || d.capability === chosen;
      })
      .forEach(function (d) {
        body.appendChild(
          el('h3', null, esc(d.capability) + ' \u00b7 ' + d.requirements.length + ' requirements'),
        );
        d.requirements.forEach(function (r) {
          var box = el('div', 'req');
          box.appendChild(el('div', 'op', esc(r.operation)));
          box.appendChild(el('div', 'rname', esc(r.name)));
          if (r.text) box.appendChild(el('div', 'rtext', esc(r.text)));
          r.scenarios.forEach(function (sc) {
            var w = el('div', 'scn');
            w.appendChild(el('div', 'sname', esc(sc.name)));
            w.appendChild(scenarioBody(sc.body));
            box.appendChild(w);
          });
          sd(box, r);
          body.appendChild(box);
        });
        if (!d.requirements.length) body.appendChild(el('div', 'empty', 'No requirements parsed.'));
      });
  }

  if (active === 'overview') {
    body.appendChild(el('h3', null, 'Approval'));
    body.appendChild(approvalBox(c));
  }

  if (active === 'files') {
    renderArtifactsTab(body, c, artifactDeps(c));
  }

  if (active === 'timeline') {
    body.appendChild(el('h3', null, 'Timeline'));

    // Approval is part of a change's history, so it belongs here alongside the
    // commits rather than only on the overview.
    var appr = approvals[c.name];
    if (appr && appr.latest) {
      var ev = el('div', 'row');
      ev.appendChild(el('b', null, 'Approved'));
      ev.appendChild(
        el(
          'span',
          null,
          esc(
            appr.latest.approver.name +
              ' · ' +
              ago(appr.latest.approvedAt) +
              (appr.state === 'needs-review' ? ' · superseded by later edits' : ''),
          ),
        ),
      );
      body.appendChild(ev);
    }
    var entry =
      historyByChange && historyByChange.changes ? historyByChange.changes[c.name] : undefined;

    if (historyByChange === null || historyByChange === 'loading') {
      body.appendChild(el('div', 'empty', 'Reading git history...'));
      if (historyByChange === null) loadHistory(c);
    } else if (!historyByChange.available) {
      body.appendChild(
        el('div', 'muted', esc(historyByChange.reason || 'Git history is unavailable.')),
      );
      if (c.metadata.created) {
        body.appendChild(
          el(
            'div',
            'row',
            '<b>Created</b><span>' +
              esc(c.metadata.created) +
              ' <span class="muted">from .openspec.yaml, date only</span></span>',
          ),
        );
      }
    } else if (entry === undefined) {
      body.appendChild(
        el(
          'div',
          'muted',
          'Nothing in this change has been committed yet, so there is no history to read.',
        ),
      );
      if (c.metadata.created) {
        body.appendChild(
          el('div', 'row', '<b>Created</b><span>' + esc(c.metadata.created) + '</span>'),
        );
      }
    } else {
      body.appendChild(
        el(
          'div',
          'row',
          '<b>First worked</b><span>' +
            esc(entry.firstWorked.replace('T', ' ').slice(0, 16)) +
            ' <span class="muted">' +
            ago(entry.firstWorked) +
            '</span></span>',
        ),
      );
      body.appendChild(
        el(
          'div',
          'row',
          '<b>Last worked</b><span>' +
            esc(entry.lastWorked.replace('T', ' ').slice(0, 16)) +
            ' <span class="muted">' +
            ago(entry.lastWorked) +
            '</span></span>',
        ),
      );
      body.appendChild(el('div', 'row', '<b>Commits</b><span>' + entry.commits + '</span>'));
      var elapsed = Math.round(
        (new Date(entry.lastWorked).getTime() - new Date(entry.firstWorked).getTime()) / 86400000,
      );
      body.appendChild(
        el(
          'div',
          'row',
          '<b>Elapsed</b><span>' + (elapsed < 1 ? 'under a day' : elapsed + ' days') + '</span>',
        ),
      );
    }

    body.appendChild(el('h3', null, 'Task completions'));
    var events = taskHistory[c.name];
    if (events === undefined || events === 'loading') {
      body.appendChild(el('div', 'empty', 'Reading task history...'));
      if (events === undefined) loadTaskHistory(c);
    } else if (!events.available) {
      body.appendChild(el('div', 'muted', esc(events.reason || 'No task history available.')));
    } else if (!events.events.length) {
      body.appendChild(el('div', 'muted', 'No tasks have been ticked in a commit yet.'));
    } else {
      var tl = el('div', 'tl');
      events.events.forEach(function (ev) {
        var row = el('div', 'ev');
        row.appendChild(el('div', null, esc((ev.id ? ev.id + ' ' : '') + ev.text)));
        row.appendChild(
          el('div', 'when', esc(ev.when.replace('T', ' ').slice(0, 16)) + ' · ' + ago(ev.when)),
        );
        tl.appendChild(row);
      });
      body.appendChild(tl);
    }
  }

  if (active === 'problems') {
    body.appendChild(el('h3', null, 'Problems'));

    // specdeck's own parse issues. "specdeck could not read this" and "OpenSpec
    // rejects this" are different findings with different fixes, so they are
    // never merged into one undifferentiated list.
    if (iss.length) {
      body.appendChild(el('div', 'srclabel', 'Found by specdeck while reading the files'));
      iss.forEach(function (i) {
        body.appendChild(
          el(
            'div',
            'flag ' + (i.severity === 'error' ? 'err' : 'warn'),
            esc(i.message) + (i.line ? ' <span class="muted">line ' + i.line + '</span>' : ''),
          ),
        );
      });
    }

    var vhead = el('div', 'srchead');
    vhead.appendChild(el('span', 'srclabel', 'Reported by openspec validate'));
    vhead.appendChild(el('div', 'grow'));
    var check = el('button', 'icon', 'Validate');
    check.onclick = function () {
      runValidate(c);
    };
    vhead.appendChild(check);
    body.appendChild(vhead);

    var v = validation[c.name];
    if (!v) {
      body.appendChild(el('div', 'muted pad', 'Not checked yet.'));
    } else if (!v.available) {
      // Never shown as valid. An unanswered question is not a pass.
      body.appendChild(el('div', 'flag warn', esc(v.reason || 'Validation could not run.')));
      if (v.output) body.appendChild(el('pre', 'fsource', esc(v.output)));
    } else if (v.valid && !v.issues.length) {
      body.appendChild(el('div', 'muted pad', 'No issues · checked ' + esc(ago(v.checkedAt))));
    } else {
      v.issues.forEach(function (i) {
        body.appendChild(
          el(
            'div',
            'flag ' + (i.level === 'warning' ? 'warn' : 'err'),
            esc(i.message) + (i.path ? ' <span class="muted">' + esc(i.path) + '</span>' : ''),
          ),
        );
      });
      if (!v.issues.length)
        body.appendChild(el('div', 'flag err', 'OpenSpec reports this change as invalid.'));
    }
  }

  a.appendChild(body);
  panel.innerHTML = '';
  panel.appendChild(a);

  // Restore onto the element that actually scrolls, and only after it is in the
  // document, since an element with no layout cannot take a scroll position.
  body.scrollTop = scrollTop;
}

/* A group counts as done only when it has tasks and every one is ticked, which
   is the same rule that decides whether it collapses by default. */
function taskGroupStats(change) {
  var groups = (change.tasks && change.tasks.groups) || [];
  var done = groups.filter(function (g) {
    return (
      g.tasks.length > 0 &&
      g.tasks.every(function (t) {
        return t.completed;
      })
    );
  }).length;
  return { done: done, total: groups.length };
}

function statBox(label, done, total) {
  var box = el('div', 'stat');
  box.appendChild(el('div', 'k', esc(label)));
  box.appendChild(el('div', 'v', done + '<small>/' + total + '</small>'));
  var bar = el('div', 'bar');
  var fill = el('i');
  fill.style.width = (total > 0 ? Math.round((100 * done) / total) : 0) + '%';
  bar.appendChild(fill);
  box.appendChild(bar);
  return box;
}

/* Removed and renamed requirements carry fields that only exist in a delta. */
function sd(box, r) {
  if (r.reason) box.appendChild(el('div', 'rtext', 'Reason: ' + esc(r.reason)));
  if (r.migration) box.appendChild(el('div', 'rtext', 'Migration: ' + esc(r.migration)));
  if (r.renamedFrom || r.renamedTo) {
    box.appendChild(
      el('div', 'rtext', esc(r.renamedFrom || '?') + ' \u2192 ' + esc(r.renamedTo || '?')),
    );
  }
}

function taskGroup(change, g, index) {
  var open = isGroupOpen(change.name, index, g);
  var total = g.tasks.length;
  var done = g.tasks.filter(function (t) {
    return t.completed;
  }).length;

  var wrap = el('div', 'tgroup' + (open ? ' open' : ''));

  var head = el('button', 'thead');
  head.appendChild(el('span', 'caret', '\u25b6'));
  head.appendChild(el('span', null, esc((g.number ? g.number + '. ' : '') + g.title)));
  head.appendChild(
    el('span', 'tcount' + (total > 0 && done === total ? ' tdone' : ''), done + '/' + total),
  );
  head.onclick = function () {
    setGroupOpen(change.name, index, !wrap.classList.contains('open'));
    wrap.classList.toggle('open');
  };
  wrap.appendChild(head);

  var tasksPath = tasksFileOf(change);

  var list = el('div', 'tlist');
  g.tasks.forEach(function (t) {
    var row = el('button', 'task' + (t.completed ? ' done' : ''));
    row.appendChild(el('span', 'box', t.completed ? '\u2713' : '\u25cb'));
    if (t.id) row.appendChild(el('span', 'tid', esc(t.id)));
    row.appendChild(el('span', null, esc(t.text)));
    row.title = tasksPath ? 'Click to toggle in tasks.md' : 'No tasks file resolved';
    if (tasksPath)
      row.onclick = function () {
        toggleTask(row, tasksPath, t);
      };
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}

/* The tasks file comes from the artifact the schema tracks, so a project using
   a schema that tracks something other than tasks.md still works. */
function tasksFileOf(change) {
  var found = null;
  (change.artifacts || []).forEach(function (a) {
    (a.existingPaths || []).forEach(function (p) {
      if (/tasks\.md$/i.test(p)) found = p;
    });
  });
  return found;
}

/* No optimistic update. The write happens, then the watcher reports it, then the
   board re-renders. A refused write therefore leaves the box exactly where it
   was, which is the correct outcome when an agent has edited the file. */
function toggleTask(row, tasksPath, task) {
  row.classList.add('busy');
  fetch('/api/task/toggle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      path: tasksPath,
      line: task.line,
      text: task.text,
      completed: !task.completed,
    }),
  })
    .then(function (r) {
      return r.json().then(function (b) {
        return { status: r.status, body: b };
      });
    })
    .then(function (res) {
      row.classList.remove('busy');
      if (res.status !== 200)
        toast(res.body.message || res.body.error || 'Could not update the task.', true);
    })
    .catch(function () {
      row.classList.remove('busy');
      toast('Could not reach specdeck.', true);
    });
}

function setAllGroups(change, open) {
  change.tasks.groups.forEach(function (_g, index) {
    setGroupOpen(change.name, index, open);
  });
  openPanel(change);
}

function closePanel() {
  // Closing is the easiest way to lose an edit by accident, so it asks first.
  if (selected && hasUnsavedEdit(selected)) {
    if (!window.confirm('You have unsaved changes. Discard them?')) return;
    // The user just agreed to discard, so actually discard: otherwise the
    // draft resurfaces the next time this change's panel is opened.
    discardEdit(selected);
  }
  // The editor holds a live CodeMirror view. Dropping the panel's HTML without
  // tearing it down first leaks it and its listeners.
  closeArtifactEditor();
  selected = null;
  document.getElementById('panel').innerHTML = '';
  render();
}

/**
 * Workspaces and context stores, from OpenSpec's own commands.
 *
 * Fetched on demand rather than with the board, because each call is several
 * process spawns. The age is always shown: this is a snapshot, and saying when
 * it was taken is the difference between reporting and implying.
 */
function renderStores(inner) {
  if (stores === null) {
    loadStores();
    return;
  }

  var roots = stores.workspaces.concat(stores.contextStores);

  // A machine with none registered is the normal case, not a misconfiguration,
  // so nothing is said about it at all.
  if (!roots.length && !stores.problems.length) return;

  var head = el('div', 'top');
  head.appendChild(el('h2', null, 'Workspaces and stores'));
  head.appendChild(el('span', 'grow'));
  head.appendChild(el('span', 'muted', 'checked ' + esc(ago(stores.checkedAt))));
  var again = el('button', 'icon', 'Recheck');
  again.onclick = function () {
    stores = null;
    renderHome();
  };
  head.appendChild(again);
  inner.appendChild(head);

  stores.problems.forEach(function (p) {
    inner.appendChild(el('div', 'flag warn', esc(p)));
  });

  roots.forEach(function (root) {
    var isWorkspace = root.name !== undefined;
    var row = el('div', 'storerow');

    row.appendChild(el('span', 'kind', isWorkspace ? 'workspace' : 'store'));
    row.appendChild(el('span', 'sname', esc(isWorkspace ? root.name : root.id)));

    // Glyph and words, never colour alone.
    if (root.health === 'problem') {
      row.appendChild(token('err', '▲', String(root.status.length), 'problem'));
    } else if (root.health === 'ok') {
      row.appendChild(token('ok', '✓', '', 'healthy'));
    }
    // 'unknown' renders nothing: a check that did not run has said nothing.

    row.appendChild(el('span', 'grow2'));
    if (isWorkspace && root.links.length) {
      row.appendChild(el('span', 'muted', esc(root.links.length + ' linked')));
    }
    row.appendChild(el('code', 'spath', esc(root.root)));

    // Opening a root registers it with specdeck. It never registers anything
    // with OpenSpec: this root exists because OpenSpec already says so.
    var open = el('button', 'icon', 'Open');
    open.onclick = function () {
      openRoot(root.root, isWorkspace ? 'workspace' : 'context-store');
    };
    row.appendChild(open);
    inner.appendChild(row);

    root.status.forEach(function (d) {
      var flag = el('div', 'flag ' + (d.severity === 'warning' ? 'warn' : 'err'));
      flag.appendChild(el('span', null, esc(d.message)));
      if (d.fix) flag.appendChild(el('code', 'fix', esc(d.fix)));
      inner.appendChild(flag);
    });
  });
}

/**
 * The change list: every change across every registered root.
 *
 * Rebuilt from the index on each render rather than mutated in place, for the
 * same reason as the board: there is no state here that the files do not have.
 */
function renderList() {
  var host = document.getElementById('list');
  host.innerHTML = '';

  if (changeIndex === null) {
    host.appendChild(el('div', 'empty', 'Reading your changes...'));
    loadChangeIndex();
    return;
  }

  var inner = el('div', 'inner');

  changeIndex.problems.forEach(function (p) {
    inner.appendChild(el('div', 'flag warn', esc(p.path + ': ' + p.message)));
  });

  var all = changeIndex.changes;
  var f = facets(all);
  inner.appendChild(filterBar(f));

  var rows = applySort(applyFilters(all, listPrefs), listPrefs);

  // The header filter box is visible in every view, so it has to mean the
  // same thing here as on the board: a name filter.
  if (filterText) {
    var needle = filterText.toLowerCase();
    rows = rows.filter(function (r) {
      return r.name.toLowerCase().indexOf(needle) !== -1;
    });
  }

  if (!rows.length) {
    if (filterText || isFiltered(listPrefs) || (!listPrefs.archived && all.length)) {
      // A list emptied by its own filters must say so, or it reads as a project
      // with nothing in it.
      var none = el('div', 'empty');
      none.appendChild(el('div', null, 'Every change is hidden by the active filters.'));
      var clear = el('button', 'icon', 'Clear filters');
      clear.onclick = function () {
        listPrefs = Object.assign(loadPreferences(), {
          lanes: [],
          roots: [],
          initiatives: [],
          from: '',
          to: '',
          archived: false,
        });
        savePreferences(listPrefs);
        filterText = '';
        document.getElementById('filter').value = '';
        render();
      };
      none.appendChild(clear);
      inner.appendChild(none);
    } else {
      inner.appendChild(el('div', 'empty', 'No changes yet.'));
    }
    host.appendChild(inner);
    return;
  }

  var table = el('table', 'ltable');
  var thead = el('thead');
  var hrow = el('tr');
  COLUMNS.forEach(function (col) {
    var th = el('th');
    var b = el(
      'button',
      'sortbtn' + (listPrefs.sort === col.id ? ' on' : ''),
      esc(col.label) +
        (listPrefs.sort === col.id ? (listPrefs.direction === 'asc' ? ' ↑' : ' ↓') : ''),
    );
    b.onclick = function () {
      if (listPrefs.sort === col.id) {
        listPrefs.direction = listPrefs.direction === 'asc' ? 'desc' : 'asc';
      } else {
        listPrefs.sort = col.id;
        listPrefs.direction = 'asc';
      }
      savePreferences(listPrefs);
      render();
    };
    th.appendChild(b);
    hrow.appendChild(th);
  });
  thead.appendChild(hrow);
  table.appendChild(thead);

  var tbody = el('tbody');
  rows.forEach(function (c) {
    tbody.appendChild(listRow(c));
  });
  table.appendChild(tbody);
  inner.appendChild(table);

  inner.appendChild(
    el(
      'div',
      'sub',
      rows.length + ' of ' + all.length + ' changes · scanned ' + esc(ago(changeIndex.scannedAt)),
    ),
  );
  host.appendChild(inner);
}

function listRow(c) {
  var tr = el('tr', c.archived ? 'archived' : null);

  var nameCell = el('td');
  var open = el('button', 'linkish', esc(c.name));
  open.onclick = function () {
    // The same detail the board opens. Reaching it needs the change itself,
    // which only the project that owns it has, so a row in another root
    // switches to that root first.
    openFromList(c);
  };
  nameCell.appendChild(open);
  if (c.issues) nameCell.appendChild(el('span', 'tok err', '▲ ' + c.issues));
  tr.appendChild(nameCell);

  tr.appendChild(el('td', 'muted', esc(c.rootName)));

  var laneCell = el('td');
  laneCell.appendChild(el('span', 'lanetag', esc(LABELS[c.lane] || c.lane)));
  if (c.archived && c.archivedOn) {
    laneCell.appendChild(el('span', 'muted', ' ' + esc(c.archivedOn)));
  }
  tr.appendChild(laneCell);

  tr.appendChild(
    el(
      'td',
      'muted',
      c.tasksTotal > 0
        ? esc(c.tasksCompleted + '/' + c.tasksTotal)
        : '<span class="faint">-</span>',
    ),
  );

  tr.appendChild(el('td', null, approvalCell(c)));

  // A date reconstructed from git is a good guess, not the same fact as one
  // OpenSpec recorded, so it is marked rather than presented as equivalent.
  var created = el('td', 'muted');
  if (c.created) {
    created.textContent = c.created.slice(0, 10);
    if (c.createdFrom === 'git') {
      created.appendChild(el('span', 'faint', ' ~'));
      created.title = 'Approximate: reconstructed from the earliest commit, not recorded metadata.';
    }
  } else {
    created.innerHTML = '<span class="faint">-</span>';
  }
  tr.appendChild(created);

  tr.appendChild(
    el('td', 'muted', c.lastModified ? esc(ago(c.lastModified)) : '<span class="faint">-</span>'),
  );

  return tr;
}

function approvalCell(c) {
  var a = c.approval;
  // Nothing at all when the state is unknown or absent: an indicator that has
  // not been earned is worse than no indicator.
  if (!a || a.state === 'unknown') return '<span class="faint">-</span>';
  if (a.state === 'approved') return '<span class="tok ok">✓ approved</span>';
  if (a.state === 'needs-review') return '<span class="tok warn">● needs review</span>';
  return '<span class="faint">-</span>';
}

function openFromList(c) {
  if (c.rootPath === state.activeProject) {
    var change = state.project.ok
      ? state.project.snapshot.changes.filter(function (x) {
          return x.name === c.name;
        })[0]
      : null;
    if (change) {
      // Land on the board with the change already open. Opening the panel over
      // the list would leave the reader somewhere they did not ask to be, and
      // switching to the board without opening it makes them find the card
      // again by hand. render() opens the panel for whatever `selected` names.
      selected = change.name;
      view = 'board';
      render();
    }
    return;
  }
  // Another root: switch to it, and open the change once its state arrives.
  pendingOpen = c.name;
  openProject(c.rootPath);
}

function filterBar(f) {
  var bar = el('div', 'lfilters');

  var arch = el('label', 'chk');
  var box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = listPrefs.archived;
  box.onchange = function () {
    listPrefs.archived = box.checked;
    savePreferences(listPrefs);
    render();
  };
  arch.appendChild(box);
  arch.appendChild(el('span', null, 'Archived'));
  bar.appendChild(arch);

  bar.appendChild(
    multi(
      'Lane',
      f.lanes.map(function (l) {
        return { value: l, label: LABELS[l] || l };
      }),
      'lanes',
    ),
  );

  bar.appendChild(
    multi(
      'Root',
      f.roots.map(function (r) {
        return { value: r.path, label: r.name };
      }),
      'roots',
    ),
  );

  var initiativeOptions = f.initiatives.map(function (i) {
    return { value: i, label: i };
  });
  if (f.hasUnlinked) initiativeOptions.push({ value: UNLINKED, label: 'Unlinked' });
  if (initiativeOptions.length)
    bar.appendChild(multi('Initiative', initiativeOptions, 'initiatives'));

  bar.appendChild(dateInput('From', 'from'));
  bar.appendChild(dateInput('To', 'to'));

  if (isFiltered(listPrefs)) {
    var clear = el('button', 'icon', 'Clear');
    clear.onclick = function () {
      listPrefs.lanes = [];
      listPrefs.roots = [];
      listPrefs.initiatives = [];
      listPrefs.from = '';
      listPrefs.to = '';
      savePreferences(listPrefs);
      render();
    };
    bar.appendChild(clear);
  }

  bar.appendChild(el('span', 'grow'));
  var refresh = el('button', 'icon', 'Rescan');
  refresh.onclick = function () {
    changeIndex = null;
    render();
  };
  bar.appendChild(refresh);

  return bar;
}

/** A multi-select rendered as toggles, so the active set is always visible. */
function multi(label, options, key) {
  var group = el('span', 'fgroup');
  group.appendChild(el('span', 'flabel', esc(label)));
  options.forEach(function (opt) {
    var on = listPrefs[key].indexOf(opt.value) !== -1;
    var b = el('button', 'chip' + (on ? ' on' : ''), esc(opt.label));
    b.onclick = function () {
      var next = listPrefs[key].slice();
      var at = next.indexOf(opt.value);
      if (at === -1) next.push(opt.value);
      else next.splice(at, 1);
      listPrefs[key] = next;
      savePreferences(listPrefs);
      render();
    };
    group.appendChild(b);
  });
  return group;
}

function dateInput(label, key) {
  var group = el('span', 'fgroup');
  group.appendChild(el('span', 'flabel', esc(label)));
  var input = document.createElement('input');
  input.type = 'date';
  input.value = listPrefs[key] || '';
  input.onchange = function () {
    listPrefs[key] = input.value;
    savePreferences(listPrefs);
    render();
  };
  group.appendChild(input);
  return group;
}

function loadChangeIndex() {
  return fetch('/api/changes')
    .then(function (r) {
      return r.json();
    })
    .then(function (result) {
      changeIndex = result;
      if (view === 'list') renderList();
    })
    .catch(function () {
      changeIndex = { changes: [], problems: [], scannedAt: new Date().toISOString() };
      if (view === 'list') renderList();
    });
}

/** Opens a workspace or context store as the active root, and remembers it. */
function openRoot(path, kind) {
  return fetch('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: path, kind: kind }),
  })
    .then(function () {
      return openProject(path);
    })
    .catch(function () {
      toast('Could not reach specdeck.', true);
    });
}

function loadStores() {
  return fetch('/api/stores')
    .then(function (r) {
      return r.json();
    })
    .then(function (result) {
      stores = result;
      if (view === 'home') renderHome();
    })
    .catch(function () {
      stores = {
        workspaces: [],
        contextStores: [],
        initiatives: [],
        problems: ['specdeck could not be reached to read workspaces and stores.'],
        checkedAt: new Date().toISOString(),
      };
      if (view === 'home') renderHome();
    });
}

/**
 * The OpenSpec actions that operate on a whole project.
 *
 * Each one runs OpenSpec's own command, and every failure shows the command,
 * its exit status, and its real output rather than a paraphrase.
 */
function renderProjectActions() {
  var bar = document.getElementById('pactions');
  bar.innerHTML = '';

  var make = el('button', 'icon', 'New change');
  make.onclick = function () {
    var name = window.prompt('Name for the new change (kebab-case):');
    if (!name) return;
    make.disabled = true;
    fetch('/api/change/new', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (out) {
        make.disabled = false;
        if (out.state) state = out.state;
        if (out.ok) {
          toast(out.message);
          render();
          return;
        }
        showCommandFailure('Could not create the change', out);
      })
      .catch(function () {
        make.disabled = false;
        toast('Could not reach specdeck.', true);
      });
  };
  bar.appendChild(make);

  var upd = el('button', 'icon', 'Update instructions');
  upd.title =
    'Runs openspec update. This also rewrites OpenSpec’s own global configuration, which it infers from this project.';
  upd.onclick = function () {
    if (
      !window.confirm(
        'Run openspec update in this project?\n\nThis also rewrites OpenSpec’s global configuration, which it infers from the project it is pointed at.',
      )
    ) {
      return;
    }
    upd.disabled = true;
    fetch('/api/update', { method: 'POST' })
      .then(function (r) {
        return r.json();
      })
      .then(function (out) {
        upd.disabled = false;
        if (out.state) state = out.state;
        if (out.ok) {
          toast(out.message);
          render();
          return;
        }
        showCommandFailure('Update did not complete', out);
      })
      .catch(function () {
        upd.disabled = false;
        toast('Could not reach specdeck.', true);
      });
  };
  bar.appendChild(upd);
}

/** Links a change to an initiative, when there is one to link it to. */
function initiativeRow(c) {
  var row = el('div', 'row');
  row.appendChild(el('b', null, 'Initiative'));

  var current = c.metadata && c.metadata.initiative;
  var known = stores && stores.initiatives ? stores.initiatives : [];

  if (current) {
    row.appendChild(el('span', null, esc(current.id + ' · ' + current.store)));
    return row;
  }

  if (!known.length) {
    // Offered as unavailable with the reason, rather than as a button that
    // could only ever fail.
    var why = el('span', 'muted');
    why.textContent = stores === null ? 'not checked yet' : 'no initiatives are registered';
    why.title =
      'An initiative lives in an OpenSpec context store. Create one with "openspec initiative create".';
    row.appendChild(why);
    return row;
  }

  var pick = document.createElement('select');
  var blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Link to…';
  pick.appendChild(blank);
  known.forEach(function (i) {
    var o = document.createElement('option');
    o.value = i.id;
    o.textContent = i.id + ' (' + i.store + ')';
    pick.appendChild(o);
  });
  pick.onchange = function () {
    if (!pick.value) return;
    var chosen = known.filter(function (i) {
      return i.id === pick.value;
    })[0];
    fetch('/api/initiative/link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ change: c.name, initiative: chosen.id, store: chosen.store }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (out) {
        if (out.state) state = out.state;
        if (out.ok) {
          toast(out.message);
          changeIndex = null;
          render();
          return;
        }
        // The grouping is left exactly as it was.
        showCommandFailure('Could not link the initiative', out);
      })
      .catch(function () {
        toast('Could not reach specdeck.', true);
      });
  };
  row.appendChild(pick);
  return row;
}

/**
 * The approval section of a change's overview.
 *
 * Approving is a commit, so the button opens a confirmation showing exactly
 * what would be committed rather than doing it on the first click.
 */
function approvalBox(c) {
  var box = el('div', 'approval');
  var a = approvals[c.name];

  if (!a || a.state === 'unknown') {
    box.appendChild(
      el('div', 'muted', a && a.reason ? esc(a.reason) : 'Approval state is not known here.'),
    );
    return box;
  }

  if (a.state === 'approved' && a.latest) {
    box.appendChild(
      el(
        'div',
        'row',
        '<b>Approved</b><span>' +
          esc(a.latest.approver.name) +
          ' · ' +
          esc(ago(a.latest.approvedAt)) +
          '</span>',
      ),
    );
    box.appendChild(
      el('div', 'row', '<b>Commit</b><code>' + esc(a.latest.commit.slice(0, 12)) + '</code>'),
    );
  } else if (a.state === 'needs-review') {
    box.appendChild(el('div', 'flag warn', 'Approved earlier, then these files changed:'));
    (a.drift || []).forEach(function (f) {
      box.appendChild(el('div', 'driftfile', esc(f)));
    });
  } else {
    box.appendChild(el('div', 'muted', 'This change has not been approved.'));
  }

  var act = el('button', 'act', a.state === 'approved' ? 'Approve again' : 'Approve');
  act.style.width = 'auto';
  act.onclick = function () {
    openApprove(c);
  };
  box.appendChild(act);
  return box;
}

/** Confirms an approval, showing what it covers and what OpenSpec thinks. */
function openApprove(c) {
  var modal = document.getElementById('modal');
  modal.innerHTML = '';
  var back = el('div', 'modal');
  var sheet = el('div', 'sheet');
  sheet.appendChild(el('h3', null, 'Approve ' + esc(c.name)));
  sheet.appendChild(el('div', 'muted', 'Reading what this would cover...'));
  back.appendChild(sheet);
  modal.appendChild(back);

  var close = function () {
    modal.innerHTML = '';
  };
  back.onclick = function (e) {
    if (e.target === back) close();
  };

  fetch('/api/approval?change=' + encodeURIComponent(c.name))
    .then(function (r) {
      return r.json();
    })
    .then(function (result) {
      sheet.innerHTML = '';
      sheet.appendChild(el('h3', null, 'Approve ' + esc(c.name)));

      if (!result.preflight.ok) {
        sheet.appendChild(el('div', 'flag err', esc(result.preflight.message)));
        (result.preflight.remedy || []).forEach(function (cmd) {
          sheet.appendChild(el('pre', 'fsource', esc(cmd)));
        });
        var done = el('button', 'icon', 'Close');
        done.onclick = close;
        sheet.appendChild(done);
        return;
      }

      sheet.appendChild(
        el(
          'div',
          'muted',
          'Recorded as a commit by ' +
            esc(result.preflight.approver.name) +
            '. It survives a clone, and lapses if any artifact changes.',
        ),
      );

      // Everything under the change directory that is not committed yet gets
      // committed by this. Some of it the user may not have realised was dirty.
      if (result.preflight.uncommitted.length) {
        sheet.appendChild(el('div', 'srclabel', 'Uncommitted, and will be committed'));
        result.preflight.uncommitted.forEach(function (f) {
          sheet.appendChild(el('div', 'driftfile', esc(f)));
        });
      } else {
        sheet.appendChild(
          el(
            'div',
            'muted',
            'Everything here is already committed, so this records only the approval.',
          ),
        );
      }

      // Shown, never a gate: validity and agreement are different questions.
      var v = result.validation;
      if (v && v.available && !v.valid) {
        sheet.appendChild(
          el(
            'div',
            'flag warn',
            'OpenSpec reports problems with this change. You can still approve it.',
          ),
        );
        v.issues.slice(0, 6).forEach(function (i) {
          sheet.appendChild(el('div', 'driftfile', esc(i.message)));
        });
      } else if (v && !v.available) {
        sheet.appendChild(el('div', 'muted', esc(v.reason || 'Validation could not run.')));
      }

      sheet.appendChild(el('pre', 'fsource', esc(result.preflight.command)));

      var actions = el('div', 'fclash-actions');
      var cancel = el('button', 'icon', 'Cancel');
      cancel.onclick = close;
      var go = el('button', 'icon primary', 'Approve');
      go.onclick = function () {
        go.disabled = true;
        fetch('/api/approve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ change: c.name }),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (out) {
            close();
            if (out.ok) {
              approvals[c.name] = out.approval;
              toast(out.message);
              openPanel(c);
              return;
            }
            showCommandFailure('Approval failed', out);
          })
          .catch(function () {
            go.disabled = false;
            toast('Could not reach specdeck.', true);
          });
      };
      actions.appendChild(cancel);
      actions.appendChild(go);
      sheet.appendChild(actions);
    })
    .catch(function () {
      close();
      toast('Could not reach specdeck.', true);
    });
}

/**
 * Runs OpenSpec validation for a change and shows what it said.
 *
 * Called after every save, and on demand from the Problems tab. Findings
 * replace whatever was there before, so a change that has been fixed stops
 * reporting the issues it no longer has.
 */
function runValidate(c) {
  return fetch('/api/validate?change=' + encodeURIComponent(c.name))
    .then(function (r) {
      return r.json();
    })
    .then(function (result) {
      validation[c.name] = result;
      if (selected === c.name) openPanel(c);
    })
    .catch(function () {
      validation[c.name] = {
        changeName: c.name,
        available: false,
        reason: 'specdeck could not be reached to run validation.',
        issues: [],
      };
      if (selected === c.name) openPanel(c);
    });
}

/**
 * What the artifact reader needs from the view layer.
 *
 * Passed rather than imported so `artifacts.js` never has to reach back into
 * this module, which would make the two circular.
 */
function artifactDeps(c) {
  return {
    el: el,
    esc: esc,
    toast: toast,
    renderMarkdown: renderMarkdown,
    createEditor: createEditor,
    reopen: function () {
      openPanel(c);
    },
    validate: function (change) {
      runValidate(change);
    },
    confirmDiscard: function () {
      return window.confirm('You have unsaved changes. Discard them?');
    },
  };
}

function tick() {
  document.getElementById('scan').textContent = 'scanned ' + ago(scannedAt);
}

function load() {
  var seq = ++loadSeq;
  fetch('/api/state')
    .then(function (r) {
      return r.json();
    })
    .then(function (s) {
      // A response that was overtaken - by a newer load or by a project
      // switch - describes a moment that has already passed. Applying it
      // would revert the interface, so it is dropped instead.
      if (seq !== loadSeq) return;
      if (!adoptState(s)) return;
      render();
      // Approval is a git log per change, so it is fetched after the board has
      // already painted rather than holding it up.
      loadApprovals();
    })
    .catch(function () {
      // The next SSE event retries this on its own; a toast per dropped
      // connection during a server restart would just be noise.
    });
}

/** Approval for every change in the open project, keyed by change name. */
function loadApprovals() {
  return fetch('/api/approvals')
    .then(function (r) {
      return r.json();
    })
    .then(function (result) {
      approvals = result.approvals || {};
      render();
    })
    .catch(function () {
      // Leaving the previous answer in place would be claiming to know
      // something that can no longer be checked.
      approvals = {};
    });
}

document.getElementById('filter').addEventListener('input', function (e) {
  filterText = e.target.value.trim();
  render();
});
document.getElementById('themeBtn').onclick = cycleTheme;
document.getElementById('brand').onclick = function () {
  goHome();
};
document.getElementById('viewHome').onclick = function () {
  goHome();
};
document.getElementById('viewSettings').onclick = function () {
  switchView('settings');
};
document.getElementById('viewBoard').onclick = function () {
  switchView('board');
};
document.getElementById('viewList').onclick = function () {
  switchView('list');
};
document.getElementById('viewSpecs').onclick = function () {
  switchView('specs');
};
/*
 * Clicking outside the panel closes it.
 *
 * Scoped by what the click landed on rather than by geometry. A card opens the
 * panel, so treating a card click as "outside" would close it again in the same
 * gesture; the modal and the editor sit above the panel and own their own
 * dismissal. Everything else is empty space.
 */
document.addEventListener('mousedown', function (e) {
  if (!selected) return;
  if (document.getElementById('modal').firstChild) return;
  if (document.getElementById('editor').firstChild) return;

  var t = e.target;
  if (t.closest('aside') || t.closest('.card') || t.closest('#modal') || t.closest('#editor')) {
    return;
  }
  // A header control is a deliberate action, not a click into empty space.
  if (t.closest('header')) return;

  closePanel();
});

document.addEventListener('dragover', function (e) {
  e.preventDefault();
});
document.addEventListener('drop', function (e) {
  e.preventDefault();
  // A drop anywhere other than the archive zone is rejected. Lanes are derived
  // from files, so moving a card between them would be undone on the next read.
  if (dragging) {
    toast(
      'Lanes come from your files, so cards cannot be moved between them. Only Archive is a real action.',
    );
    dragging = null;
    render();
  }
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    var modal = document.getElementById('modal');
    if (modal.firstChild) {
      modal.innerHTML = '';
      return;
    }
    closePanel();
  }
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('filter').focus();
  }
});

applyTheme(currentTheme());
var events = new EventSource('/api/events');
/**
 * The surface the screenshot harness drives the interface through.
 *
 * The client used to be one script in the page, so `scripts/capture/` could
 * reach `state`, `selected`, and `openPanel` as globals. Bundling put all of
 * that inside a closure, which is the point of bundling. Rather than leak the
 * internals back out, the few things automation genuinely needs are named here,
 * so renaming a variable cannot silently break the screenshots.
 */
export const automation = {
  /** Read-only view of what the board is currently showing. */
  read() {
    return { state: state, view: view, selected: selected, approvals: approvals };
  },
  switchView: function (next) {
    switchView(next);
  },
  /** Forces a theme, so each shot can be taken in both. */
  applyTheme: function (name) {
    applyTheme(name);
  },
  loadApprovals: function () {
    return loadApprovals();
  },
  /** Opens a change's detail panel on a given tab. */
  openChange: function (name, tab) {
    if (!state || !state.project.ok) return false;
    var target = state.project.snapshot.changes.filter(function (c) {
      return c.name === name;
    })[0];
    if (!target) return false;
    if (tab) activeTab[target.name] = tab;
    selected = target.name;
    openPanel(target);
    return true;
  },
  /** Clears whatever the previous shot left open, editing included. */
  clear: function () {
    resetEditing();
    selected = null;
    document.getElementById('panel').innerHTML = '';
    document.getElementById('editor').innerHTML = '';
  },
};

/**
 * Starts the client.
 *
 * Boot moved out of module scope so the entry point can finish wiring shared
 * helpers before the first render runs. Under ES modules every import is
 * evaluated before any statement in the importer, so anything this needed at
 * load time would otherwise be reached before it existed.
 */
export function boot() {
  events.addEventListener('change', load);
  load();
  setInterval(tick, 1000);
}
