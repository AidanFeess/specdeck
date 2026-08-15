/**
 * The artifact reader and editor.
 *
 * The list of what can be read comes from the change's artifacts, which the
 * server derived from the workflow schema. Nothing here knows the names
 * proposal, design, specs, or tasks: a project using a schema that declares
 * something else gets exactly the same treatment, which is the point.
 *
 * Dependencies arrive as an argument rather than as imports. The view code in
 * `app.js` owns the DOM helpers and the toast, and importing them back from
 * here would make the two modules circular for no gain.
 */

/** Per-change view state, kept across re-renders of the panel. */
const selection = {};
const showSource = {};
const editing = {};
const drafts = {};
/** What was on disk when a save was refused, per change. */
const conflicts = {};

let editor = null;

/** Tears down any live editor. Called before the panel is rebuilt. */
export function closeArtifactEditor() {
  if (editor) {
    editor.destroy();
    editor = null;
  }
  const host = document.getElementById('editor');
  if (host) host.innerHTML = '';
}

/** True when an edit is open with text the user has not saved. */
export function hasUnsavedEdit(changeName) {
  return Boolean(editing[changeName] && drafts[changeName] !== undefined);
}

/**
 * Renders the Files tab into `body`.
 *
 * `deps` supplies el, esc, toast, renderMarkdown, createEditor, and reopen,
 * where reopen re-renders the panel after state that affects it has changed.
 */
export function renderArtifactsTab(body, change, deps) {
  const { el, esc } = deps;

  const layout = el('div', 'files');
  const list = el('div', 'flist');
  const pane = el('div', 'fpane');

  // Every declared artifact, including ones with no file yet. An artifact the
  // schema requires and the change has not produced is information, not an
  // absence to hide.
  (change.artifacts || []).forEach(function (artifact) {
    const paths = artifact.existingPaths || [];

    if (paths.length === 0) {
      const row = el('div', 'frow missing');
      row.appendChild(el('span', 'fname', esc(artifact.id)));
      const why =
        artifact.status === 'blocked' && (artifact.missingDeps || []).length
          ? 'waiting on ' + artifact.missingDeps.join(', ')
          : artifact.status;
      row.appendChild(el('span', 'muted', esc(why)));
      list.appendChild(row);
      return;
    }

    paths.forEach(function (path) {
      const active = current(change) === path;
      const row = el('button', 'frow' + (active ? ' on' : ''));
      row.appendChild(el('span', 'fname', esc(label(artifact, path, paths.length))));
      row.appendChild(el('span', 'muted', esc(artifact.status)));
      row.onclick = function () {
        if (!confirmDiscard(change, deps)) return;
        selection[change.name] = path;
        deps.reopen();
      };
      list.appendChild(row);
    });
  });

  layout.appendChild(list);
  layout.appendChild(pane);
  body.appendChild(layout);

  const path = current(change);
  if (!path) {
    pane.appendChild(el('div', 'muted pad', 'Select a file to read it.'));
    return;
  }

  pane.appendChild(el('div', 'muted pad', 'Loading…'));

  fetch('/api/artifact?path=' + encodeURIComponent(path))
    .then(function (r) {
      return r.json();
    })
    .then(function (result) {
      pane.innerHTML = '';
      if (!result.ok) {
        pane.appendChild(
          el('div', 'pad err', esc(result.message || 'That file could not be read.')),
        );
        return;
      }
      paint(pane, change, result.artifact, deps);
    })
    .catch(function () {
      pane.innerHTML = '';
      pane.appendChild(el('div', 'pad err', 'Could not reach specdeck.'));
    });
}

function current(change) {
  const chosen = selection[change.name];
  if (chosen) return chosen;
  const first = (change.artifacts || []).filter(function (a) {
    return (a.existingPaths || []).length > 0;
  })[0];
  return first ? first.existingPaths[0] : null;
}

/** The readable name of a file, used where there is no artifact to name it. */
function fileLabel(path) {
  const parts = path.split(/[\\/]/);
  const name = parts[parts.length - 1];
  return name === 'spec.md' && parts.length > 1 ? parts[parts.length - 2] + '/spec.md' : name;
}

/** A file's label: the artifact id, or its filename when one artifact has many. */
function label(artifact, path, count) {
  if (count === 1) return artifact.id;
  const parts = path.split(/[\\/]/);
  const name = parts[parts.length - 1];
  // A delta spec is <capability>/spec.md, and the capability is the useful half.
  return name === 'spec.md' && parts.length > 1 ? parts[parts.length - 2] : name;
}

function paint(pane, change, artifact, deps) {
  const { el, esc } = deps;

  const bar = el('div', 'fbar');
  bar.appendChild(el('code', 'fpath', esc(artifact.path)));
  bar.appendChild(el('div', 'grow'));

  if (editing[change.name]) {
    // The editor is not painted into this pane. A 600px column is a poor place
    // to write a spec, so it opens over the main page instead, where there is
    // room to actually read what you are editing.
    paintEditor(change, artifact, deps);
  }

  const source = showSource[change.name];
  const toggle = el('button', 'icon', source ? 'Rendered' : 'Source');
  toggle.title = source ? 'Show the rendered document' : 'Show the exact file contents';
  toggle.onclick = function () {
    showSource[change.name] = !source;
    deps.reopen();
  };
  bar.appendChild(toggle);

  const edit = el('button', 'icon', editing[change.name] ? 'Editing' : 'Edit');
  edit.disabled = Boolean(editing[change.name]);
  edit.onclick = function () {
    editing[change.name] = true;
    deps.reopen();
  };
  bar.appendChild(edit);

  pane.appendChild(bar);

  if (source) {
    const pre = el('pre', 'fsource');
    // Assigned as text, never as markup: this view exists to show exactly what
    // the file says, and parsing it would defeat that.
    pre.textContent = artifact.text;
    pane.appendChild(pre);
    return;
  }

  const view = el('div', 'fdoc');
  view.innerHTML = deps.renderMarkdown(artifact.text);
  pane.appendChild(view);
}

function paintEditor(change, artifact, deps) {
  const { el, esc } = deps;

  // Tear down any previous editor before building the new surface. Doing it
  // afterwards would empty the host that surface was just mounted into.
  closeArtifactEditor();

  const host = document.getElementById('editor');

  const sheet = el('div', 'editsheet');
  const bar = el('div', 'fbar');
  bar.appendChild(el('strong', null, esc(fileLabel(artifact.path))));
  bar.appendChild(el('code', 'fpath', esc(artifact.path)));
  bar.appendChild(el('div', 'grow'));

  // The text an earlier refused save preserved, if there is any.
  const startingText = drafts[change.name] !== undefined ? drafts[change.name] : artifact.text;
  let baseHash = artifact.hash;

  const pane = sheet;

  const cancel = el('button', 'icon', 'Cancel');
  cancel.onclick = function () {
    if (!confirmDiscard(change, deps)) return;
    stopEditing(change);
    deps.reopen();
  };

  const save = el('button', 'icon primary', 'Save');
  bar.appendChild(cancel);
  bar.appendChild(save);
  pane.appendChild(bar);

  // A refused save leaves this behind. Until the user decides what to do about
  // it, saving again would be guessing on their behalf.
  const clash = conflicts[change.name];
  if (clash) {
    const notice = el('div', 'fclash');
    notice.appendChild(
      el(
        'div',
        null,
        'This file changed on disk while you were editing. Your text is below, unsaved.',
      ),
    );

    const reload = el('button', 'icon', 'Discard mine, load theirs');
    reload.onclick = function () {
      delete conflicts[change.name];
      stopEditing(change);
      deps.reopen();
    };

    const overwrite = el('button', 'icon', 'Overwrite theirs with mine');
    overwrite.onclick = function () {
      // Explicit, and only ever explicit. This is the one path that discards
      // somebody else's write, so it exists as a button and not as a fallback.
      baseHash = clash.hash;
      delete conflicts[change.name];
      save.onclick();
    };

    const actions = el('div', 'fclash-actions');
    actions.appendChild(reload);
    actions.appendChild(overwrite);
    notice.appendChild(actions);
    pane.appendChild(notice);
  }

  const surface = el('div', 'fedit');
  pane.appendChild(surface);
  host.appendChild(sheet);

  editor = deps.createEditor(surface, startingText, function (text) {
    drafts[change.name] = text;
  });
  editor.focus();

  save.onclick = function () {
    save.disabled = true;
    const text = editor.text();

    fetch('/api/artifact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: artifact.path, text: text, hash: baseHash }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (result) {
        save.disabled = false;
        if (result.ok) {
          // The board catches up on its own: the write fires the watcher, which
          // pushes an update. Nothing here has to ask for one.
          baseHash = result.hash;
          stopEditing(change);
          deps.toast('Saved.');
          deps.validate(change);
          deps.reopen();
          return;
        }

        if (result.reason === 'conflict') {
          // The user's text is kept, deliberately. Refusing a write to avoid
          // losing work, and then losing the work, would be the worst outcome.
          //
          // The base hash is deliberately *not* advanced here. Adopting the new
          // one would let the very next save overwrite whatever arrived, which
          // is the clobber this whole mechanism exists to prevent. Moving past a
          // conflict has to be something the user chooses, below.
          drafts[change.name] = text;
          conflicts[change.name] = result.current;
          deps.toast(result.message, true);
          deps.reopen();
          return;
        }

        deps.toast(result.message || result.error || 'That file could not be saved.', true);
      })
      .catch(function () {
        save.disabled = false;
        deps.toast('Could not reach specdeck.', true);
      });
  };
}

function stopEditing(change) {
  editing[change.name] = false;
  delete drafts[change.name];
  delete conflicts[change.name];
  closeArtifactEditor();
}

/** Confirms before unsaved text is thrown away. */
function confirmDiscard(change, deps) {
  if (!hasUnsavedEdit(change.name)) return true;
  const ok = deps.confirmDiscard();
  if (ok) stopEditing(change);
  return ok;
}
