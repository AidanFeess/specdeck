## Context

specdeck today is a reader. It parses OpenSpec artifacts from disk, reconstructs timelines and
sync state from git, and writes exactly one thing back: a task checkbox. Its two load-bearing
principles (everything is derived, nothing is stored; and specdeck writes nothing into your
repository) are what make the board trustworthy, because it has no memory of its own to
disagree with the files.

This change asks the product to review, edit, and approve. Reviewing is free. Editing is a
straightforward extension of the one write path that already exists. Approval is not: it is
state that must survive a clone and be visible to a teammate, and there is nowhere to put it
that does not violate one of the two principles. The design's central job is to choose where
approval lives and to state precisely which principle gives way.

Three constraints bound everything below:

- `npx specdeck@latest` must stay instant and must fetch nothing at runtime. Whatever the
  client grows, it ships prebuilt.
- OpenSpec owns its own file formats and its own registrations. specdeck reads them and
  invokes OpenSpec's commands; it never writes OpenSpec's metadata itself.
- The server is loopback-only with no authentication, and it can now write files and create
  commits. Anything it renders comes from a repository, and a repository is not trusted input.

Current shape: `src/core/` reads (fs, git, parse, model, openspec), `src/server/server.ts`
routes, `src/server/app-html.ts` is the entire client as one 1,957-line template literal with
no build step. `archive.ts` and `init.ts` each spawn the bundled OpenSpec CLI through their own
`execFile` wrapper.

## Goals / Non-Goals

**Goals:**

- Read every artifact a change's schema declares, plus accumulated specs, without leaving the
  dashboard.
- Edit any of them, with the same refuse-rather-than-clobber guarantee task toggles already
  have, and with OpenSpec's own validation as the feedback loop.
- Record approval somewhere a `git clone` carries and a teammate sees, while keeping approval
  *state* derived rather than stored.
- Consume OpenSpec 1.4.1's `workspace`, `context-store`, and `initiative` surfaces instead of
  reimplementing a cross-repo model.
- Add the sortable, filterable, archive-inclusive list that issue #1525 asks for.

**Non-Goals:**

- Rejection, review comments, threads, or any multi-round review protocol. Approval is one
  bit derived from git; a review conversation belongs in a forge.
- Editing OpenSpec's metadata files directly. `.openspec.yaml` changes only through
  `openspec set change`.
- Creating, modifying, or removing OpenSpec's workspace and context-store registrations.
- Merge, rebase, push, or any git operation beyond the scoped approval commit and the
  fast-forward pull that already exists.
- A framework rewrite of the client. The build step introduced here bundles the existing
  imperative code; it does not replace it.

## Decisions

### Approval is a pathspec-scoped commit carrying a trailer

Approving runs, with no `git add` beforehand:

```
git -c core.hooksPath=<default> commit -m "Approve <name>" -m "Approved-change: <name>" -m "Approved-by: <name> <email>" -- <changeDir>
```

Committing with an explicit pathspec commits those paths from the working tree without
touching the index, so a user's unrelated staged work survives an approval untouched. That is
the whole reason for the pathspec form over `git add` followed by a bare commit.

Approval state is then *read back*, never cached:

1. `git log --format=%H%x00%an%x00%ae%x00%aI%x00%B -z -- <changeDir>` and take the newest
   commit whose body carries `Approved-change: <name>`.
2. Committed drift: `git diff --quiet <commit> HEAD -- <changeDir>`.
3. Uncommitted drift: `git status --porcelain -- <changeDir>`.

Approved means a matching commit exists and both drift checks are clean. Any drift means needs
review. No matching commit means no approval state at all: not "rejected", not "pending".

*Alternatives considered.* A field in `.openspec.yaml`: rejected, OpenSpec owns that file and
`openspec set change` exposes only `--initiative`; specdeck would be inventing schema in
someone else's format. A record in `~/.specdeck/`: rejected, it is per-machine, so the
two-person review case the README leads with would silently not work. Git notes: rejected,
notes are not pushed by default, so an approval would be invisible to teammates in exactly the
way that matters most. A tag per approval: rejected, approval recurs every time artifacts
change and the tag namespace would fill with noise.

*What this costs.* "specdeck writes nothing into your repository" stops being true. The
replacement invariant, asserted by the rewritten `no-writes.test.ts`: specdeck writes only to
paths OpenSpec owns, never a sidecar of its own, and never creates a commit the user did not
explicitly ask for.

Hooks are **not** bypassed. No `--no-verify`. A hook that rejects the commit is a hook doing
its job, and its output is shown.

### Approval does not require validity

A change that fails `openspec validate` can still be approved, with the failures shown first.
Validity and agreement are different questions, and a reviewer who wants to sign off on a
proposal whose delta spec is malformed is making a defensible call. The interface shows both
states independently rather than gating one on the other.

### Approval is refused, loudly, when git cannot support it

Not a repository, no commits yet, no configured `user.name`/`user.email`, detached HEAD, or a
rebase/merge in progress: each is refused with the specific reason and, for identity, the
exact `git config` commands to fix it. Approval is the one feature that does not degrade
gracefully, because a half-recorded approval is worse than none.

### One runner for the bundled OpenSpec CLI

`src/core/openspec/run.ts` exports a single `runOpenspec(projectRoot, args)` returning
`{ ok, command, code, stdout, stderr }`, invoking `process.execPath` against the bundled
`bin/openspec.js` exactly as `archive.ts` does today. `archive.ts` and `init.ts` move onto it;
nothing else spawns OpenSpec.

Every invocation is non-interactive by construction (`-y`, `--no-interactive`, `--json` as the
command supports) and time-limited. `command` is the reconstructed, copy-pasteable invocation:
the user-facing `openspec archive foo -y`, not the internal `node .../bin/openspec.js` form,
because a failure the user cannot reproduce by hand is a dead end.

*Alternative considered.* The JSON-RPC bridge issue #1525 describes: rejected, that shape
exists because the dashboard there lives inside OpenSpec's own process. specdeck is a separate
package and process, and a subprocess boundary with `--json` on the far side is the same
contract with less machinery.

### The client gets a build step, and stays a single self-contained document

`app-html.ts` splits into source modules under `src/client/` and is bundled at `npm run build`
into one document embedded in `dist/`. Runtime behavior is unchanged: one HTML response, no
network fetches, `npx` still instant, because the bundling happens when the package is built,
not when it is run.

A markdown renderer and an editor component are vendored into that bundle. This is the point
the README already predicted: "it will want a real build if the interface grows much."

*Alternatives considered.* Hand-rolling a markdown renderer and using a bare `<textarea>`:
rejected, a subtly wrong renderer misrepresents the specs it is showing, which is worse than a
dependency. A framework rewrite: rejected as scope; the bundler takes the existing imperative
code as-is.

### Rendered markdown is sanitized, and the document carries a CSP

Artifact markdown comes from a repository. A repository can contain `<script>` in a proposal,
and this page can write files and create commits on the machine it renders on. Raw HTML is
disabled in the renderer, output is sanitized, and the served document carries a
`Content-Security-Policy` with no `unsafe-inline` for scripts. This is the first time specdeck
renders repository content as anything but text, so it is the first time this matters.

### Writes are guarded by a content hash, not a timestamp

An artifact is loaded with a hash of its exact bytes; the save carries that hash back; the
server rehashes before writing and refuses on mismatch. Mistrusting mtime here is deliberate ,
its resolution is coarse and an agent can easily rewrite a file inside one tick.

This generalizes `toggle-task.ts`'s line-content check to whole files. Both keep the same
contract: refuse and preserve the user's text, never merge, never clobber.

### The expensive reads stay off the state payload

`/api/state` is rebuilt on every filesystem event. Approval derivation is a `git log` per
change, store health is a process spawn per root, and validation is a process spawn per
change. None of them belong there.

They get on-demand endpoints alongside the existing `/api/overview` and `/api/history`
precedent: `/api/approval`, `/api/validate`, `/api/stores`. Results carry the time they were
computed, and the interface shows that age rather than implying freshness, which is the same rule that
already governs remote sync state.

### Roots gain a kind; the existing registry migrates by absence

`ProjectEntry` gains an optional `kind: 'project' | 'workspace' | 'context-store'`. An entry
without one is a plain project, which is exactly what every entry written so far is. No config
version bump: `coerce` already tolerates missing and unknown fields, and a version bump would
imply a migration that does not exist.

Workspaces and context stores are *discovered* from `openspec workspace list --json` and
`openspec context-store list --json`. specdeck's registry records which of them the user wants
on their dashboard; OpenSpec's registration remains the authority on which exist.

## Risks / Trade-offs

- **A design principle stops being true.** → The README is rewritten in this change, not
  after it, and `no-writes.test.ts` is rewritten to assert the narrower invariant. A principle
  that quietly stops holding is worse than one that is openly narrowed.
- **Approval commits files the user had not committed yet.** → The preflight lists exactly
  which files will be committed, including ones the user may not have realized were dirty, and
  the commit is pathspec-scoped so nothing outside the change directory can be swept in.
- **A commit hook rejects the approval.** → Reported with the hook's own output and exit
  status. Never retried with `--no-verify`.
- **Hand-editing a delta spec silently breaks it.** Three hashes instead of four and a
  scenario vanishes. → Validation on save, plus specdeck's own parser issues, both shown
  against the file. This is the failure mode most likely to bite, and it is why editing ships
  with validation rather than after it.
- **Repository markdown becomes executable content.** → Raw HTML disabled, output sanitized,
  CSP on the document. Treated as the security boundary it is, not a rendering detail.
- **Store commands are process spawns and are slow.** → On demand only, cached per root, age
  shown. Never on the SSE path.
- **The client refactor is large and behavior-preserving, which is the easiest kind to get
  wrong.** → It lands first and alone, with `app-html.test.ts` extended before the split, so
  the bundle is verified against the current document before any feature is added to it.
- **Sequencing dependency.** The `project-registry` delta modifies a requirement that lives
  only inside `add-specdeck-mvp` today. → `add-specdeck-mvp` must be archived before this
  change can be, and the first task records that.

## Migration Plan

Phased so each phase is independently shippable, mirroring issue #1525's own phasing:

1. **Foundation.** Extract `runOpenspec`; move `archive.ts` and `init.ts` onto it. Split
   `app-html.ts` into `src/client/` behind a build step, with tests extended first. No
   user-visible change.
2. **Read.** Artifact viewer for schema-declared artifacts and main specs. List view with
   sorting, filtering, and the archived toggle. Store, workspace, and initiative discovery
   with health badges, read-only.
3. **Write.** Artifact editor with the hash guard and validation on save. Initiative linking
   through `openspec set change`. The remaining OpenSpec actions.
4. **Approve.** Approval commit, derivation, drift, board and list indicators, timeline
   events.
5. **README.** Rewritten against what actually shipped, including the narrowed write
   invariant.

Rollback is per phase: phases 1 and 2 add no writes, and phases 3 and 4 are additive routes
that can be removed without touching anything a previous phase installed.

## Open Questions

- **Trailer naming.** `Approved-by:` is generic and reads well in `git log`, but it is not a
  reserved trailer and another tool could use it differently. A namespaced
  `Specdeck-approved-by:` is unambiguous and uglier. Currently leaning generic `Approved-by:`
  paired with `Approved-change:`, which is what actually scopes the approval.
- **Commit signing.** Left entirely to the user's git configuration, so a project with
  `commit.gpgsign` set will prompt or fail depending on the agent. Whether specdeck should
  detect that up front and refuse, rather than surfacing a confusing signing failure, is
  unresolved.
- **Approving several changes at once.** Currently one commit per change. A batch approval is
  plausible for an initiative spanning repositories, but the derivation would need to handle
  one commit approving multiple change directories.
- **Which editor component.** Not chosen. The requirement is that it vendor cleanly into a
  single document, handle markdown reasonably, and not pull a framework in behind it.
