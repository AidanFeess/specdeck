## Why

specdeck reads an OpenSpec project and shows it, then stops at the door. You cannot read a
proposal or a design in it, you cannot fix a sentence without leaving for an editor, and
nothing anywhere records that a human looked at a change and agreed with it. The board is a
window; the work still happens somewhere else.

OpenSpec issue [#1525](https://github.com/Fission-AI/OpenSpec/issues/1525) asks for the
product specdeck is already most of the way to being: a local, loopback-only UI over stores
and changes, read-first, growing into editing and approval. It also names the gaps that make
it hard: `created` missing from `list --json`, no archived-changes surface, no repo binding.
specdeck already solves all three by reading `.openspec.yaml` and git directly.

At the same time OpenSpec 1.4.1 shipped `workspace`, `context-store`, and `initiative`, each
with `--json` and most with `doctor`. That is the cross-repo model the issue's "store
selector" is asking for, it exists today, and specdeck ignores every command in it.

## What Changes

- **Every artifact becomes readable in the dashboard.** The detail panel stops being four
  fixed tabs and instead renders whatever artifacts the change's schema declares, as
  markdown. Main specs under `openspec/specs/` get the same treatment.
- **Every artifact becomes editable in the dashboard.** Raw markdown editing with live
  preview, saved through the same optimistic-concurrency guard that protects task toggles: if
  an agent rewrote the file since it was loaded, the write is refused rather than merged.
  `openspec validate --json` runs on save and its findings are shown against the file.
- **Approval becomes a real, shared act.** Approving a change stages its directory and
  commits it with an `Approved-by:` trailer. Approval is then derived by reading git, exactly
  like every other state specdeck shows: a change is approved while its artifacts match the
  approving commit, and returns to "needs review" the moment one of them moves. It survives a
  clone, and a teammate sees it.
- **OpenSpec's own commands get a surface.** A single runner for the bundled CLI, replacing
  the three ad-hoc `execFile` call sites, exposing `new change`, `validate`, `update`, `set
  change`, and `archive` with the command, exit status, and real output shown on failure.
- **Stores, workspaces, and initiatives become first class.** A selector above the board
  spanning registered projects, OpenSpec workspaces, and context stores; per-store health
  badges from `workspace doctor --json` and `context-store doctor --json`; changes grouped by
  the initiative they are linked to, and linkable from the dashboard via
  `openspec set change --initiative`.
- **A list view alongside the board.** Sortable by name, created, last modified, derived
  lane, task progress, approval state, and store. Filterable by lane, store (multi-select),
  initiative, date range, and an archived toggle. That last one is the archived surface issue #1525 says does not exist.
- **The README is rewritten.** It currently describes a read-only board and states "specdeck
  writes nothing into your repository" as a design principle. Approval commits change that,
  and the README has to say so plainly rather than quietly stop being true.

**BREAKING**: the design principle "specdeck writes nothing into your repository" no longer
holds. specdeck now writes artifact edits and creates approval commits. The narrower
invariant that replaces it (specdeck writes only inside OpenSpec-owned paths, never its own
sidecar files, and never a commit the user did not ask for) is what the existing
`no-writes.test.ts` gets rewritten to assert.

## Capabilities

### New Capabilities

- `artifact-review`: reading and editing every schema-declared artifact in the dashboard,
  including markdown rendering, the concurrency-guarded write path, and validation feedback.
- `change-approval`: the git-backed approval commit, the derivation of approval state from
  git, and the drift back to "needs review".
- `openspec-actions`: one runner for the bundled OpenSpec CLI, and the failure reporting
  contract every action inherits from it.
- `store-federation`: workspaces, context stores, and initiatives as navigable, health-checked
  roots alongside registered projects.
- `change-index`: the sortable, filterable list view over changes, spanning active and
  archived.

### Modified Capabilities

- `board-view`: cards gain approval and review-needed state, and the board gains a switch to
  the list view.
- `project-registry`: the registry stores OpenSpec workspaces and context stores as roots,
  not only plain project paths.

## Impact

- **New**: `src/core/openspec/run.ts` (CLI runner), `src/core/openspec/stores.ts`,
  `src/core/approval/` (commit, derive), `src/core/write/artifact.ts`,
  `src/server/artifacts.ts`.
- **Modified**: `src/server/server.ts` (artifact read/write, approval, store, validate, and
  action routes), `src/server/app-html.ts` (artifact viewer/editor, list view, store selector; this is where the single served HTML document stops being viable), `src/core/config/store.ts`
  (roots, not just project paths), `src/core/model/types.ts`, `src/core/git/` (commit support,
  approval history), `src/core/openspec/archive.ts` and `init.ts` (onto the shared runner),
  `README.md`.
- **Tests**: `src/core/read/no-writes.test.ts` is rewritten from "writes nothing" to "writes
  only OpenSpec-owned paths, and never commits unasked".
- **Dependencies**: a markdown renderer and an editor component enter the client. Both must
  be vendored, because `npx specdeck` must not fetch anything at runtime.
- **Sequencing**: the `board-view` and `project-registry` deltas modify capabilities that
  currently exist only inside `add-specdeck-mvp`. That change must be archived before this one
  can be.
