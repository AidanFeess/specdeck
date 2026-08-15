# specdeck

A local dashboard for [OpenSpec](https://github.com/Fission-AI/OpenSpec) projects.

Read, edit, and approve your specs in one place, without spending a single token.

> **Status: pre-release.** Built in the open using OpenSpec to track its own
> development. See [the active change](openspec/changes/add-review-and-openspec-integration/)
> for exactly what is planned and how far along it is.

## Why

When two people work an OpenSpec project together, there is no cheap way to see what
specs exist, which changes are in flight, or what a teammate just pushed. You either
read a sprawl of nested markdown by hand, or you ask an AI agent and spend tokens
summarizing files that are already sitting on your disk.

And once you have read them, there is nowhere to say _yes, this is right_. Reviewing a
change means opening an editor, and agreeing with one means telling somebody in chat.

specdeck answers those questions from the filesystem and from git, lets you fix what you
find without leaving, and records agreement somewhere a clone carries. It never calls a
model to do any of it.

The design comes from [OpenSpec issue #1525](https://github.com/Fission-AI/OpenSpec/issues/1525),
which asked for a local, read-first UI over stores and changes that grows into editing
and approval. This is that, built outside OpenSpec so it can move at its own pace.

## Install and run

specdeck is meant to be run, not installed:

```bash
npx specdeck@latest
```

That starts a local server and opens your browser on whatever folder you are in.
Nothing is uploaded anywhere.

Use `@latest` rather than a bare `npx specdeck`. npx caches by the exact text you
type, so a bare name keeps serving whatever it fetched the first time and never
checks for a newer release.

```bash
npx specdeck@latest ../some-other-project   # open a specific folder
npx specdeck@latest --port 4000 --no-open   # pick a port, skip the browser
npm i -g specdeck                           # or install it as a real command
```

### Requirements

- Node 20.19 or newer
- git, for sync state, timelines, and approval. Everything else works without it.

## What it does

**A board of your changes.** Lanes are derived from which artifacts exist and how many
tasks are ticked. There is no status field to keep in sync, because there is no status
field at all.

**A list, when the board is the wrong shape.** Every change across every root you have
registered, sortable by name, lane, task progress, approval, creation date, and last
activity, and filterable by lane, root, initiative, and date range. Archived changes are
one toggle away rather than absent.

**Read every artifact.** Whatever artifacts your workflow schema declares, whether that is
proposal, design, specs, and tasks or something your own schema invented, rendered as markdown, with
the exact source one click away. Accumulated capability specs read the same way.

**Edit them in place.** Any artifact, in a real editor, saved straight back to the file.
If an agent rewrote it while you were typing, the save is refused rather than merged, and
your text is kept while you decide what to do about it. `openspec validate` runs on save
and reports against the change.

**Approve a change, and have it mean something.** Approving records a commit carrying an
`Approved-by:` trailer. The state is then read back out of git, so it survives a clone and
appears for a teammate the moment they pull. Edit any artifact afterwards and the change
returns to _needs review_ on its own.

**Workspaces, stores, and initiatives.** OpenSpec's own cross-repository model, read from
its own commands: workspaces and context stores appear alongside your projects with health
from `openspec workspace doctor` and `openspec context-store doctor`, and changes can be
grouped by the initiative they belong to.

**OpenSpec's commands, where you are already looking.** Create a change, validate one,
refresh instruction files, link an initiative, archive. Each runs the real command, and
when one fails you get the command, the exit status, and its own output.

**Task tracking that writes back.** Click a checkbox and it is written to `tasks.md`.

**Sync state per change.** What is uncommitted, what you have not pushed, and what a
teammate pushed that you do not have. A change that exists only on the remote appears
as a ghost card you can pull.

**Real timelines.** First worked, last worked, per-task completion times, and approvals,
all reconstructed from git history, so they survive a fresh clone.

**Live updates.** Your agent writes a spec, the board moves. No refreshing.

**Agent handoff.** Detects which AI tools your project has OpenSpec wired into and
hands work off with the command OpenSpec itself generated.

**Bootstrapping.** Point specdeck at a folder with no OpenSpec and it offers to set it
up, with a tool picker and the exact command shown alongside the button.

## Design principles

These are load bearing, not decoration. They explain most of the product's behavior.

**Everything is derived, nothing is stored.** specdeck keeps no status field, no sidecar
progress database, and no directory OpenSpec does not own. If the board says a change is
in progress, that is because its tasks file says so. Approval is no exception: it is a
commit, and the state is recomputed from git every time it is shown. Edit files outside
specdeck and the board simply agrees with you.

**specdeck writes only what you asked it to, only where OpenSpec already writes.** An
earlier version of this README promised specdeck wrote nothing into your repository at
all. That is no longer true, and saying so plainly is better than letting a principle
quietly lapse. What holds now:

- The only files specdeck writes are OpenSpec artifacts, at paths OpenSpec owns.
- It creates no file of its own inside a repository: no sidecar, no cache, no state.
  Its configuration and your registry live in `~/.specdeck/`.
- It never creates a commit you did not ask for. Approving is the only thing that
  commits, it commits only that change's directory, and it leaves anything you had
  staged exactly as you left it.
- Reading a project still writes nothing whatsoever.

There is a test for each of those.

**It never claims to know more than it does.** Local state is live. Remote state is a
snapshot from your last fetch, and the board always tells you how old it is. A creation
date reconstructed from git is marked approximate, because it is not the same fact as one
OpenSpec recorded. When a check cannot run, whether that is validation, a
store's health, or approval, nothing is shown rather than a reassuring default.

**Failures are readable.** When something fails, you get the command, the exit status,
and the real output, not a spinner and not a paraphrase. A commit hook that rejects an
approval is reported, never bypassed.

## What it will not do

- Move a card between lanes. Lanes come from your files, so a drag would be undone on
  the next read. Only archiving is a real action, and it is the only drag that exists.
- Reject a change, thread a review conversation, or track who still needs to look. Approval
  is one bit derived from git; a discussion belongs in a forge.
- Approve on your behalf, or bypass a hook to make an approval land.
- Merge your edit with someone else's. A save whose base has moved is refused, and
  overwriting anyway is a button you press knowingly.
- Register, modify, or remove OpenSpec's own workspaces and context stores. It reads
  them; OpenSpec owns them.
- Pull anything but a fast-forward. If your branch and the remote have both moved,
  specdeck stops and tells you rather than creating a merge commit.
- Browse repositories you have not cloned. That is a different product.
- Call a language model. Answering these questions cheaply is the entire point.

## Supported AI tools

Detected from the files `openspec init` generates:

Claude Code, Cursor, Windsurf, opencode, Gemini CLI, GitHub Copilot, Kilo Code, Roo Code.

Codex is reported as undetectable rather than absent, because it keeps its commands in
your home folder rather than in the project, so there is nothing in the repository to
look at.

Any other tool still works. Handoff falls back to copying the prompt, which is the path
that gets the most polish precisely because it works everywhere.

A weekly CI job initializes every supported tool and fails if OpenSpec starts generating
files somewhere specdeck does not expect, because that failure is otherwise silent.

## Known limitations

- Approval needs git, an initial commit, a configured `user.name` and `user.email`, and a
  branch. Each of those is refused with the specific reason and, where there is one, the
  command that fixes it.
- Approval is one trailer in one commit. Anyone who can commit can write one, so it
  records agreement rather than enforcing it. If you need enforcement, that is what
  branch protection on a forge is for.
- `Update instruction files` runs `openspec update`, which also rewrites OpenSpec's own
  global configuration from the project it is pointed at. It is behind a confirmation for
  that reason, and never runs as part of reading a project.
- Handoff can open a terminal or an existing agent session, but only for tools it
  knows how to start. Anything else falls back to copying the prompt and says which
  method it used, so a fallback is visible rather than silent.
- Attaching to a session opens it with the prompt on your clipboard. There is no
  verified way to push a message into a running conversation, so it does not pretend to.
- Timelines need git. Without a repository, dates fall back to file modification times,
  which do not survive a clone, and the interface says the values are approximate.
- The served page is around 750kb, most of it the editor. That is nothing over loopback,
  but it is no longer the tiny document it started as.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
git clone https://github.com/AidanFeess/specdeck.git
cd specdeck
npm install
npm run verify
```

`npm run verify` runs formatting, linting, type checking, and tests, which is exactly
what CI runs.

The fastest way to understand the codebase is
[the design document](openspec/changes/add-review-and-openspec-integration/design.md),
which records the decisions and why the alternatives were rejected.

## License

MIT. See [LICENSE](LICENSE).
