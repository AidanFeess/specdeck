# specdeck

A local dashboard for [OpenSpec](https://github.com/Fission-AI/OpenSpec) projects.

See what specs you have and where each change is, without spending a single token.

> **Status: pre-release.** Built in the open using OpenSpec to track its own
> development. See [the active change](openspec/changes/add-specdeck-mvp/) for exactly
> what is planned and how far along it is.

## Why

When two people work an OpenSpec project together, there is no cheap way to see what
specs exist, which changes are in flight, or what a teammate just pushed. You either
read a sprawl of nested markdown by hand, or you ask an AI agent and spend tokens
summarizing files that are already sitting on your disk.

specdeck answers those questions from the filesystem and from git, and it never calls
a model to do it.

## Install and run

specdeck is meant to be run, not installed:

```bash
npx specdeck
```

That starts a local server and opens your browser on whatever folder you are in.
Nothing is uploaded anywhere.

```bash
npx specdeck ../some-other-project    # open a specific folder
npx specdeck --port 4000 --no-open    # pick a port, skip the browser
```

### Requirements

- Node 20.19 or newer
- git, for sync state and timelines. Everything else works without it.

## What it does

**A board of your changes.** Lanes are derived from which artifacts exist and how many
tasks are ticked. There is no status field to keep in sync, because there is no status
field at all.

**Projects home.** Every project you have opened, with its lane breakdown, task totals,
sync state, and last commit. Opening a folder uses your operating system's own picker.

**Detail per change.** Overview, tasks, specs, timeline, and problems, each on its own
tab. Requirements and scenarios are parsed and shown in full, with delta operations
labelled and removal reasons and migrations surfaced.

**Task tracking that writes back.** Click a checkbox and it is written to `tasks.md`.
If an agent rewrote the file since the board read it, the write is refused rather than
clobbering its work.

**Sync state per change.** What is uncommitted, what you have not pushed, and what a
teammate pushed that you do not have. A change that exists only on the remote appears
as a ghost card you can pull.

**Real timelines.** First worked, last worked, and per-task completion times, all
reconstructed from git history, so they survive a fresh clone.

**Live updates.** Your agent writes a spec, the board moves. No refreshing.

**Agent handoff.** Detects which AI tools your project has OpenSpec wired into and
hands work off with the command OpenSpec itself generated.

**Bootstrapping.** Point specdeck at a folder with no OpenSpec and it offers to set it
up, with a tool picker and the exact command shown alongside the button.

## Design principles

These are load bearing, not decoration. They explain most of the product's behavior.

**Everything is derived, nothing is stored.** specdeck keeps no status field, no sidecar
progress database, and no directory OpenSpec does not own. If the board says a change is
in progress, that is because its tasks file says so. Edit files outside specdeck and the
board simply agrees with you.

**specdeck writes nothing into your repository.** Its configuration and your project
registry live in `~/.specdeck/`. The only files that ever appear in your repo are real
OpenSpec artifacts, produced by real OpenSpec commands. There is a test that asserts it.

**It never claims to know more than it does.** Local state is live. Remote state is a
snapshot from your last fetch, and the board always tells you how old it is. When a
comparison cannot be performed, indicators are hidden rather than defaulted to "in sync".

**Failures are readable.** When something fails, you get the command, the exit status,
and the real output, not a spinner and not a paraphrase.

## What it will not do

- Move a card between lanes. Lanes come from your files, so a drag would be undone on
  the next read. Only archiving is a real action, and it is the only drag that exists.
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

- Handoff currently implements copying only. Opening a terminal or attaching to a
  running agent session are designed but not built, so selecting them falls back to
  copying and says so.
- Timelines need git. Without a repository, dates fall back to file modification times,
  which do not survive a clone, and the interface says the values are approximate.
- The client is a single served HTML document with no build step. That keeps
  `npx specdeck` instant, but it will want a real build if the interface grows much.

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
[the design document](openspec/changes/add-specdeck-mvp/design.md), which records the
decisions and why the alternatives were rejected.

## License

MIT. See [LICENSE](LICENSE).
