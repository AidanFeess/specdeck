import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';

/**
 * The artifact editor.
 *
 * Wrapped rather than used directly so the rest of the client never imports
 * CodeMirror. Everything the views need is create, read, and destroy, and
 * keeping the surface that small is what makes the component replaceable.
 *
 * Nothing here decides whether a write is allowed. The editor only holds text;
 * refusing a stale write is the server's job, and duplicating that decision on
 * the client would mean two answers to the same question.
 */

/**
 * Mounts an editor into `parent`.
 *
 * `onChange` fires on every edit so the view can track unsaved text, which is
 * what the abandon warning is built on.
 */
export function createEditor(parent, doc, onChange) {
  const listener = EditorView.updateListener.of((update) => {
    if (update.docChanged && typeof onChange === 'function') {
      onChange(update.state.doc.toString());
    }
  });

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: typeof doc === 'string' ? doc : '',
      extensions: [
        basicSetup,
        markdown(),
        listener,
        EditorView.lineWrapping,
        // The board's own theme owns the colours; the editor inherits them
        // rather than shipping a second palette that would drift from it.
        EditorView.theme({ '&': { fontSize: '12px' }, '.cm-content': { fontFamily: 'inherit' } }),
      ],
    }),
  });

  return {
    /** The current text, for saving. */
    text: () => view.state.doc.toString(),
    /** Replaces the text, for reloading after a refused write. */
    setText: (next) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
