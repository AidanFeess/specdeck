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
/**
 * The hash a save must be based on, per change, fixed when editing starts.
 *
 * It lives here rather than in a closure because the panel repaints on every
 * watcher event, and a repaint must never rebase an open edit onto whatever
 * just arrived on disk. Advancing this is always an explicit act: a successful
 * save, or the user choosing to overwrite after a refused one.
 */
const bases = {};

let editor = null;
/** What the live editor was mounted for: { name, path, clash }. */
let mounted = null;

/**
 * The last artifact fetched per path.
 *
 * The panel is rebuilt on every watcher event, and the file it shows arrives
 * by fetch. Without this, each rebuild paints a loading stub, the scroll
 * restore in openPanel lands on a pane with no height, and the reader is
 * thrown back to the top every few seconds while an agent writes files. The
 * cached copy is painted synchronously so the restore has something to land
 * on; the fetch then revalidates and repaints only when the file actually
 * changed.
 */
const artifactCache = {};

/** Tears down any live editor. Called before the panel is rebuilt. */
export function closeArtifactEditor() {
  if (editor) {
    editor.destroy();
    editor = null;
  }
  mounted = null;
  const host = document.getElementById('editor');
  if (host) host.innerHTML = '';
}

/** True when an edit is open with text the user has not saved. */
export function hasUnsavedEdit(changeName) {
  return Boolean(editing[changeName] && drafts[changeName] !== undefined);
}

/**
 * Ends a change's edit and throws its draft away. For the moment the user has
 * already confirmed a discard, so the text does not resurface when the panel
 * is next opened.
 */
export function discardEdit(changeName) {
  stopEditing({ name: changeName });
}

/**
 * Forgets every open edit, discarding whatever was in them.
 *
 * Only for the screenshot harness, which takes each shot twice and needs the
 * second pass to start from the same place as the first. Nothing in the
 * interface calls this: discarding a user's text without asking is exactly what
 * the rest of this module exists to prevent.
 */
export function resetEditing() {
  for (const name of Object.keys(editing)) delete editing[name];
  for (const name of Object.keys(drafts)) delete drafts[name];
  for (const name of Object.keys(conflicts)) delete conflicts[name];
  for (const name of Object.keys(bases)) delete bases[name];
  closeArtifactEditor();
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

  const cached = artifactCache[path];
  if (cached) {
    paint(pane, change, cached, deps);
  } else {
    pane.appendChild(el('div', 'muted pad', 'Loading…'));
  }

  fetch('/api/artifact?path=' + encodeURIComponent(path))
    .then(function (r) {
      return r.json();
    })
    .then(function (result) {
      if (!result.ok) {
        delete artifactCache[path];
        pane.innerHTML = '';
        pane.appendChild(
          el('div', 'pad err', esc(result.message || 'That file could not be read.')),
        );
        return;
      }
      artifactCache[path] = result.artifact;
      // Already painted from cache, and the file has not moved since: the
      // pane is correct as it stands, and repainting it would only cost the
      // reader their place.
      if (cached && cached.hash === result.artifact.hash) return;
      const scroller = pane.closest('.abody');
      const at = scroller ? scroller.scrollTop : 0;
      pane.innerHTML = '';
      paint(pane, change, result.artifact, deps);
      if (scroller) scroller.scrollTop = at;
    })
    .catch(function () {
      // With a cached copy on screen, a dropped request is not worth
      // replacing the document with an error; the next event retries.
      if (cached) return;
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

  // The panel repaints on every watcher event, and this is called from each
  // repaint. If the editor the user is typing into is already showing this
  // file, leave it alone: rebuilding it would steal focus, reset the cursor,
  // and drop the undo history mid-keystroke. A rebuild happens only when the
  // file being edited changes or a conflict notice has to appear or go away.
  const clash = conflicts[change.name];
  if (
    editor &&
    mounted &&
    mounted.name === change.name &&
    mounted.path === artifact.path &&
    mounted.clash === Boolean(clash)
  ) {
    return;
  }

  // Tear down any previous editor before building the new surface. Doing it
  // afterwards would empty the host that surface was just mounted into.
  closeArtifactEditor();
  mounted = { name: change.name, path: artifact.path, clash: Boolean(clash) };

  const host = document.getElementById('editor');

  const sheet = el('div', 'editsheet');
  const bar = el('div', 'fbar');
  bar.appendChild(el('strong', null, esc(fileLabel(artifact.path))));
  bar.appendChild(el('code', 'fpath', esc(artifact.path)));
  bar.appendChild(el('div', 'grow'));

  // The text an earlier refused save preserved, if there is any.
  const startingText = drafts[change.name] !== undefined ? drafts[change.name] : artifact.text;

  // The base is fixed the moment editing starts. Later repaints reach this
  // code with a fresher artifact, and adopting its hash would make the next
  // save silently overwrite whatever produced it.
  if (bases[change.name] === undefined) bases[change.name] = artifact.hash;

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
      bases[change.name] = clash.hash;
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
      body: JSON.stringify({ path: artifact.path, text: text, hash: bases[change.name] }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (result) {
        save.disabled = false;
        if (result.ok) {
          // The board catches up on its own: the write fires the watcher, which
          // pushes an update. Nothing here has to ask for one.
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
  delete bases[change.name];
  closeArtifactEditor();
}

/** Confirms before unsaved text is thrown away. */
function confirmDiscard(change, deps) {
  if (!hasUnsavedEdit(change.name)) return true;
  const ok = deps.confirmDiscard();
  if (ok) stopEditing(change);
  return ok;
}
