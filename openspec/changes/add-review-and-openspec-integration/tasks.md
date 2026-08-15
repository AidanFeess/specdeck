## 1. Sequencing and the OpenSpec runner

- [x] 1.1 Archive `add-specdeck-mvp` so `openspec/specs/` exists and the `board-view` and `project-registry` deltas have base specs to modify
- [x] 1.2 Add `src/core/openspec/run.ts` exporting `runOpenspec(projectRoot, args)` returning `{ ok, command, code, stdout, stderr }`, invoking `process.execPath` against the bundled `bin/openspec.js`
- [x] 1.3 Make the returned `command` the copy-pasteable user-facing form (`openspec archive foo -y`), not the internal `node .../bin/openspec.js` invocation
- [x] 1.4 Give the runner a time limit that terminates the command and reports the timeout as the reason
- [x] 1.5 Report a missing bundled OpenSpec without spawning anything, including the command to run by hand
- [x] 1.6 Move `archive.ts` onto the runner, deleting its private `execFile` wrapper
- [x] 1.7 Move `init.ts` onto the runner, deleting its private `execFile` wrapper
- [x] 1.8 Add a test asserting no module outside `run.ts` spawns the OpenSpec CLI
- [x] 1.9 Test the runner: success, non-zero exit with output preserved, timeout, missing binary

## 2. Client build step

- [x] 2.1 Extend `app-html.test.ts` to cover the current document's structure before anything moves
- [x] 2.2 Split `src/server/app-html.ts` into modules under `src/client/`, preserving behavior exactly
- [x] 2.3 Add a bundler to `npm run build` producing one self-contained document embedded in `dist/`, with no runtime network fetches
- [x] 2.4 Verify `npx specdeck` startup is unchanged and the served page requests nothing external
- [x] 2.5 Vendor a markdown renderer into the bundle with raw HTML disabled and output sanitized
- [x] 2.6 Serve the document with a `Content-Security-Policy` carrying no `unsafe-inline` for scripts
- [x] 2.7 Test that a proposal containing `<script>` and an `onerror` attribute renders as inert text

## 3. Reading artifacts

- [x] 3.1 Add `/api/artifact` returning an artifact's bytes plus a content hash, refusing paths outside the open project
- [x] 3.2 Drive the detail view's artifact list from the change's schema rather than fixed filenames
- [x] 3.3 Render each existing artifact as formatted markdown, including artifacts specdeck has no special handling for
- [x] 3.4 Show declared-but-missing artifacts in their schema-reported state, with blocking dependencies named
- [x] 3.5 Render capability specs from the main specs directory through the same reader
- [x] 3.6 Add a source toggle showing the file's exact bytes, returning to the rendered view on switch back
- [x] 3.7 Test artifact listing against a schema declaring an artifact specdeck does not know

## 4. The change list

- [x] 4.1 Add a list view alongside the board, showing active changes for the open root
- [x] 4.2 Make columns sortable by name, created, last modified, lane, task progress, approval state, and root
- [x] 4.3 Group rows with no value for the sorted column rather than ordering them as zero or epoch
- [x] 4.4 Resolve each change's creation date from `.openspec.yaml`, falling back to git's earliest date marked approximate, and showing nothing when neither exists
- [x] 4.5 Add the archived toggle, off by default, showing each archived change's archive date
- [x] 4.6 Add filters for lane, root (multi-select), initiative, and date range, applied together with the active set visible
- [x] 4.7 State when filters are excluding everything and offer to clear them
- [x] 4.8 Persist the chosen view, sort, and filters across restarts
- [x] 4.9 Open the same change detail from a row as from a card, returning to the list with sort and filters intact
- [x] 4.10 Test sorting with missing values and the metadata-then-git creation date fallback

## 5. Stores, workspaces, and initiatives

- [x] 5.1 Add `src/core/openspec/stores.ts` reading `workspace list --json`, `context-store list --json`, and `initiative list --json` through the runner
- [x] 5.2 Add `/api/stores` computing store data on demand and carrying the time it was computed
- [x] 5.3 Add `kind: 'project' | 'workspace' | 'context-store'` to `ProjectEntry`, resolving entries without one as plain projects
- [x] 5.4 Verify a registry written before kinds existed loads with every entry intact
- [x] 5.5 Build one root selector spanning registered projects, workspaces, and context stores, marking each kind, persisting the selection
- [x] 5.6 Show the reason a root cannot be resolved while leaving the other roots usable
- [x] 5.7 Add health badges from `workspace doctor --json` and `context-store doctor --json`, with the full diagnostic output available
- [x] 5.8 Show no health state, rather than a healthy one, when a diagnostic cannot run
- [x] 5.9 Convey every health state with a glyph and text, not color alone
- [x] 5.10 Read each change's initiative link from its metadata and offer grouping by initiative across roots, showing unlinked changes as unlinked
- [x] 5.11 Confirm adding or removing a specdeck root runs no OpenSpec command and leaves OpenSpec's registrations untouched
- [x] 5.12 Show store data with its visible age, and never compute it on the SSE path

## 6. Editing artifacts

- [x] 6.1 Add `src/core/write/artifact.ts` writing a file only when its current bytes still hash to the value the caller loaded
- [x] 6.2 Add `/api/artifact` POST refusing writes outside the open project and refusing on hash mismatch
- [x] 6.3 Render artifacts read-only, requiring an explicit action to begin editing
- [x] 6.4 Warn before discarding unsaved text when an edit is abandoned
- [x] 6.5 Preserve the user's text and explain the conflict when a write is refused because the file moved underneath
- [x] 6.6 Broadcast after a successful write so the board updates without a manual refresh
- [x] 6.7 Test: concurrent rewrite refused, unchanged file written, path escape refused, no sidecar file created

## 7. Validation and OpenSpec actions

- [x] 7.1 Add `/api/validate` running `openspec validate <change> --json` through the runner
- [x] 7.2 Run validation after an artifact save and attach findings to the change, keeping the file saved
- [x] 7.3 Clear a change's previous findings when validation reports none
- [x] 7.4 Show a change as unvalidated with a reason, never as valid, when validation cannot run
- [x] 7.5 Distinguish OpenSpec validation findings from specdeck's own parse issues by source in the problems view
- [x] 7.6 Add a create-change action running `openspec new change`, with the new change appearing without a manual refresh
- [x] 7.7 Add an update action running `openspec update` and reporting the files it changed
- [x] 7.8 Add an initiative-link action running `openspec set change --initiative`, leaving grouping unchanged on failure
- [x] 7.9 Show the command, exit status, and unmodified output for every failed action
- [x] 7.10 Show unavailable actions with the reason rather than offering them as though they would succeed
- [x] 7.11 Refuse any action naming a change or path outside the open project, spawning nothing

## 8. Approval

- [x] 8.1 Add `src/core/approval/commit.ts` running a pathspec-scoped `git commit -- <changeDir>` with `Approved-change:` and `Approved-by:` trailers, without `git add` and without `--no-verify`
- [x] 8.2 Add `src/core/approval/derive.ts` finding the newest commit touching the change directory whose body carries `Approved-change: <name>`
- [x] 8.3 Detect committed drift with `git diff --quiet <commit> HEAD -- <changeDir>` and uncommitted drift with `git status --porcelain -- <changeDir>`
- [x] 8.4 Return approved, needs-review, never-approved, or unknown, never defaulting an unreadable state to unapproved
- [x] 8.5 Refuse approval with the specific reason for: not a repository, no commits, detached HEAD, rebase or merge in progress
- [x] 8.6 Refuse approval when git has no `user.name` or `user.email`, showing the exact `git config` commands
- [x] 8.7 Add `/api/approval` deriving state on demand, and `/api/approve` recording it
- [x] 8.8 Build the approval preflight listing the artifacts to be committed and any uncommitted files in the change directory
- [x] 8.9 Show validation failures in the preflight without blocking approval
- [x] 8.10 Report a rejecting commit hook with its own output and exit status
- [x] 8.11 Include approval events in the change timeline, ordered with the other events
- [x] 8.12 Test: approve, drift after edit, revert restores approved, re-approval leaves the earlier approval in history, unrelated staged work survives untouched

## 9. Board integration

- [x] 9.1 Show approved, needs-review-after-approval, and never-approved on each card, and nothing when the state is unknown
- [x] 9.2 Show the approver and approval time on an approved card
- [x] 9.3 Convey approval state with a glyph and text, not color alone
- [x] 9.4 Add the board-to-list switch, keeping the same root and the same derived lanes in both views
- [x] 9.5 Keep `/api/state` free of approval, validation, and store work, leaving all three on their own endpoints

## 10. README and the write invariant

- [x] 10.1 Rewrite `no-writes.test.ts` to assert the narrowed invariant: only OpenSpec-owned paths, no specdeck sidecar files, no unrequested commit
- [x] 10.2 Rewrite the README's "What it does" around viewing, editing, and approving, and the new list, store, and initiative surfaces
- [x] 10.3 Replace the "specdeck writes nothing into your repository" principle with the narrowed invariant, stating plainly what specdeck now writes and when
- [x] 10.4 Document that approval is a commit, that it survives a clone, that it lapses on any change, and that hooks are never bypassed
- [x] 10.5 Update "What it will not do" to cover rejection, review threads, and managing OpenSpec's own registrations
- [x] 10.6 Update the known limitations, replacing the no-build-step note with what the build step now does
- [x] 10.7 Credit OpenSpec issue #1525 as the origin of the design
- [x] 10.8 Update `CONTRIBUTING.md` for the client build step

## 11. Verification

- [x] 11.1 Run `npm run verify` clean
- [x] 11.2 Run `npm run check:harness` clean
- [x] 11.3 Walk the flow end to end on a real project: open, read every artifact, edit one, see validation, approve, edit again, see it lapse
- [x] 11.4 Confirm on a project with no git repository that reading and editing work and approval is refused with its reason
- [x] 11.5 Confirm on a machine with no workspaces or context stores registered that nothing suggests misconfiguration
