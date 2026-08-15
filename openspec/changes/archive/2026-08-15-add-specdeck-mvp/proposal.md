## Why

When two developers work an OpenSpec project together, there is no cheap way to see
what specs exist, which changes are in flight, or what a teammate just pushed. The
options today are reading a sprawl of nested markdown directories by hand, or asking
an AI agent and spending tokens to summarize files that are sitting on disk.

specdeck answers "what specs do we have, and where is each one" without invoking a
model. It is a locally runnable dashboard that derives everything from the filesystem
and from git, and it stays live as those files change.

## What Changes

- New local web application, distributed as `npx specdeck`, that serves a browser UI
  from a small Node process
- Board view of OpenSpec changes with lanes derived from artifact existence and task
  checkbox ratios, never from a stored status field
- Detail views for every change, capability, requirement, and scenario, parsed from
  the OpenSpec markdown on disk
- Git-derived sync state per change, showing uncommitted work, work ahead of the
  remote, and work a teammate has pushed that you do not have yet
- Git-derived timeline data per change and per capability, giving real started and
  last worked dates that survive cloning
- Live updates on local file change, pushed to the browser, with a reconcile backstop
- Agent handoff that dispatches OpenSpec workflows to whichever AI harness the project
  is configured for, resolved by capability with a universal fallback
- Bootstrapping OpenSpec into folders that do not have it, from a button or a copyable
  command
- Multi-project registry so several OpenSpec projects can be switched between

## Capabilities

### New Capabilities
- `project-registry`: registering, switching between, and configuring OpenSpec projects
  without writing any files into the projects themselves
- `openspec-model`: parsing OpenSpec changes, specs, and artifacts from disk, and
  deriving lane state from them
- `board-view`: the lane board, cards, primary actions, and archive
- `spec-detail`: detail views for changes, capabilities, requirements, and scenarios
- `git-sync`: comparing working tree, local HEAD, and remote tracking refs to produce
  per-change sync state
- `live-updates`: filesystem watching, event coalescing, and pushing state to the browser
- `agent-handoff`: detecting configured AI harnesses and dispatching OpenSpec workflows
  to them
- `project-init`: initializing OpenSpec in folders that do not have it
- `timeline-analytics`: deriving change and capability history from git

### Modified Capabilities

None. This is the first change in the project.

## Impact

Greenfield. No existing code is affected.

External surfaces this change depends on:

- The `openspec` CLI, invoked as a subprocess for `init`, `new change`, and `archive`.
  Its JSON output is incomplete in places, so reads are done by parsing files directly.
- The `@fission-ai/openspec` package's public exports, used for planning home
  resolution and the configured tool registry. Its internal parsers are not
  importable and must not be relied on.
- The `git` binary, invoked as a subprocess with an argument array, never a shell string.
- Undocumented Claude Code session storage, used only for the optional enhanced
  handoff path, behind feature detection.

Risk concentration: the filesystem watcher is the only thing that moves a card. A
missed event is indistinguishable from an idle board, so watcher reliability is the
top correctness concern in this change.
