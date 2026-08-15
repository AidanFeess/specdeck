## Context

specdeck is a greenfield local dashboard for OpenSpec projects. The primary user is a
developer working inside a repository, usually alongside one teammate on the same
repository. The job is answering "what specs do we have and where is each one" without
spending model tokens.

Three properties of OpenSpec drive the whole design:

1. **There is no status field.** Not in `.openspec.yaml`, not in any artifact. Progress
   exists on three independent axes: which artifact files exist, the ratio of ticked
   task checkboxes, and whether the change sits in the active or archive directory.
2. **Only two state transitions have a command.** `openspec new change` and
   `openspec archive`. Every step between them is an AI agent writing a markdown file.
3. **The generated agent instructions are already harness independent.** The skill files
   OpenSpec writes for all thirty supported tools are close to identical, and they are
   self driving: they instruct the agent to call `openspec status` and
   `openspec instructions` and derive the rest.

Investigation also found at least nine other OpenSpec user interfaces already published,
several implementing a derived lane board. Bootstrapping OpenSpec into folders that do
not have it is the one capability none of them claim.

## Goals / Non-Goals

**Goals:**

- Answer questions about spec state with zero model invocations
- Never display a state that contradicts the files on disk
- Stay live as local files change
- Make a teammate's pushed work visible without being asked
- Work identically against GitHub, GitLab, Bitbucket, self hosted, and bare remotes
- Write nothing into a managed repository except real OpenSpec artifacts

**Non-Goals:**

- Browsing repositories the user has not cloned. That is a different, read only product.
- Any status vocabulary of specdeck's own invention
- Editing spec content. Agents write specs; specdeck reads them.
- Committing or pushing on the user's behalf
- Replacing or wrapping the OpenSpec CLI's authoring workflows

## Decisions

### Derive everything, store nothing

Lane state is a pure function of files on disk. specdeck maintains no status field,
no sidecar database of progress, and no directory OpenSpec does not own.

The alternative, a mutable status machine in a sidecar file, was rejected. It drifts the
moment anyone edits files outside the dashboard, which is the normal case here because
agents do the writing. Among published OpenSpec interfaces, the one that took this
approach has the least adoption in the category.

Consequence: the ideas lane is out of scope. A lane before the first real artifact would
require inventing a file format OpenSpec does not define.

### Shell out for mutations, parse markdown for reads

The `@fission-ai/openspec` package exposes only its top level entry point, so its
parsers, archive logic, and artifact graph cannot be imported. Its public surface does
export planning home resolution and the configured tool registry, which are used.

Mutations therefore invoke the CLI as a subprocess with color disabled. Reads parse the
markdown directly, because the CLI's JSON coverage is incomplete (listing specs ignores
the JSON flag) and because per requirement and per scenario detail is needed anyway.

Alternative considered: driving the exported commander program in process. Rejected
because it writes to standard output and terminates the process.

The package is a pinned dependency rather than an assumed global install, so that
initializing OpenSpec works for users who do not already have it.

### Only archiving is a drag

OpenSpec has workflows, not edges between columns, and they do not map one to one onto
lane boundaries. Dragging between derived lanes would require inventing a mapping that
does not exist upstream, and the card would snap back on the next read.

Cards instead carry a primary action labelled with the next step OpenSpec itself
reports. Archiving keeps its drag because it is the one gesture that causes the state
change it depicts.

### The card never moves on hope

There is no optimistic pending state. A card only moves when the watcher observes the
write. For most harnesses the handoff is a clipboard copy that returns nothing, so an
optimistic state would have no exit condition other than a timer, which would mean
shipping a board state whose truth condition is elapsed time.

Instead the card comes alive in place: it shows what was dispatched, when, and which
file it is waiting for. Any stuck dispatch is cleared by the user, never auto reverted.

### Handoff is one payload and a ladder of transports

Because the generated instructions are self driving, the payload is a single line
naming the change, identical across all thirty harnesses. Only delivery varies:

    copy payload         always available, works everywhere, never fails
    open a terminal      harnesses with a usable non interactive entry point
    open a session       harnesses exposing session discovery

Higher rungs are additive rows in one modal, not a different interaction. The copy path
is built first and polished, so that a failure higher up is cosmetic.

Capability gaps fall through silently. Runtime failures do not: a method that exists,
was attempted, and failed reports a human readable error and offers the lower method as
an explicit choice. Silent degradation on runtime failure would let an integration break
entirely without producing a single bug report.

Session handoff opens a session with the payload copied. There is no verified way to
inject a message into a running conversation, so the interface never claims to.

### Git local comparison only

The remote half of sync comes from git refs the user already has, not from a hosting
provider API. On a repository the user has not cloned there is no local side to compare
against, so the API would serve a different product. Git also covers every provider
through one code path, and inherits credential helpers, proxies, and enterprise
certificate stores that already work for this remote.

A future cached sparse clone, not an API client, is the way to support repositories
that are not checked out. It reuses the same parser layer and yields real commit
history. To keep that door open, all file inventory goes through one interface that
maps a reference to a map of path to blob hash. Provider APIs return the same git blob
hashes, so any future source plugs in behind a finished state machine.

### Two clocks, stated plainly

Local state is live and push based. Remote state is a snapshot from the last successful
fetch. Both appear on the same card, so the age of the remote snapshot is permanent
chrome rather than an occasional warning.

Fetching happens on a background interval and on explicit request, never during
rendering, and always with terminal prompting disabled so a missing credential fails
fast instead of hanging invisibly.

### Modification detection avoids porcelain status

Under the Windows default line ending conversion, porcelain status reports files as
modified when only line endings differ, persistently. Agents write markdown with line
feed endings into carriage return checkouts, so a status based board would mark every
agent touched spec permanently dirty. Diff against head applies the clean filter and is
immune.

### Guards run before comparison, and failures suppress rather than default

A failed remote resolution produces an empty difference set, which is indistinguishable
from everything matching. Left unguarded, a repository with no remote at all renders as
entirely in sync. Every guard failure therefore suppresses indicators board wide and
states the reason.

### Watcher choice and coalescing

chokidar v4 is the watcher. It is the ecosystem default, has no mandatory native
binary, and therefore cannot break `npx specdeck` for a user without a compiler.
`@parcel/watcher` is faster but is a native module, and a distribution failure on an
unusual platform is a worse outcome than a few milliseconds of latency. Node's
built-in recursive watch is rejected because recursive mode is unavailable on Linux.

The coalescing quiet period is 300ms, and the reconcile backstop runs every 10s.

These numbers were chosen rather than measured. A dedicated measurement spike was
started and abandoned as poor value: the quiet period only has to exceed the largest
gap between consecutive events inside one archive burst, and that is far easier to
observe against the real watcher once it exists than against a synthetic harness. The
error is deliberately asymmetric. Rendering a directory mid mutation is a correctness
bug the user reads as broken, while an extra 200ms of latency is imperceptible, so
300ms errs long on purpose. Revisit it with real burst traces during implementation,
not before.

## Risks / Trade-offs

**The watcher is the only thing that moves a card.** With no drag and no optimistic
state, a missed event looks exactly like an idle board. Mitigation: measure watcher
latency and loss on cross filesystem paths, network mounts, and editors that save by
rename before board code is written; run a periodic reconcile that recomputes state
regardless of events; display the age of the last successful scan; and assert the
derivation invariant in tests so no code path outside the watcher and reconciler can
move a card.

**Bursts of events can render a directory mid mutation.** Archiving deletes a change
directory and recreates it elsewhere, which derives cleanly to an earlier lane while in
flight. Mitigation: coalesce over a quiet period tuned against a real multi file
mutation, not a single save.

**The harness layer sits on surfaces upstream does not promise.** Session storage is
undocumented internal state on one harness. The per tool command path table is not
exported and will drift. Worst, the settings that decide what OpenSpec generates are
global to the user, not to the project, so two developers on one repository can produce
different file sets and detection can be correct for one and wrong for the other.
Mitigation: feature detect every undocumented call and hide the feature when detection
fails; keep the copy path polished so higher rungs are optional; pin the OpenSpec
dependency; add continuous integration that initializes every supported tool in a
temporary directory and detects drift in the command path table.

**Initialization sits outside every invariant.** It is a write feature, there is nothing
to compare against, and the command writes only empty directories that git does not
track, so git cannot distinguish initialized from uninitialized. Mitigation: treat it as
its own surface with its own detection, disclose effects outside the project and the
dependence on global settings, and always show the exact command next to the button.

**Never invoke commands that mutate global configuration during reads.** The OpenSpec
update command writes the user's global configuration, inferring settings from the
scanned project. It must not be called on scan, refresh, or project open.

**The category is crowded.** Several published interfaces already implement a derived
board. The differentiation is the combination of multi project switching, git derived
timeline data, and initialization, rather than the board itself.

## Migration Plan

Greenfield. There is nothing to migrate.

Sequencing follows the dependency order rather than the demo order. The read model and
parsing come first because everything reads from them. Sync and live updates come next
because they are the properties that make the board trustworthy. Handoff and
initialization come last because both degrade gracefully to a copied command.

The repository dogfoods itself from the first commit. It currently has a remote
configured and no commits, so the no commits guard is exercised immediately rather than
in an exotic edge case, and every card carries an uncommitted indicator until work is
committed.

## Open Questions

- What quiet period correctly coalesces an archive without making ordinary saves feel
  slow? To be settled by measurement rather than assumption.
- Should the project switcher show counts for background projects, given they refresh on
  a slow interval and their numbers will lag the active project's?
- Is a single change of this size the right unit, or should the capabilities be split
  into several changes before implementation begins?
- Does the enhanced session handoff path belong in this change at all, given it depends
  on undocumented internals and was never verified end to end during investigation?
