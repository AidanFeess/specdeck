# specdeck

A local dashboard for [OpenSpec](https://github.com/Fission-AI/OpenSpec) projects. It reads
your `openspec/` directory and your git history, and shows you what specs exist, what
changes are in flight, and what your teammate just pushed.

It never calls a language model, so looking costs nothing.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/board-dark.png">
  <img alt="A kanban board of OpenSpec changes, in lanes from Draft through Archived, with a greyed card for a change that exists only on the remote" src="docs/media/board-light.png">
</picture>

```bash
npx specdeck@latest
```

That is the whole install. It starts a local server, opens your browser on whatever folder
you are in, and uploads nothing anywhere.

> The screenshots on this page show an invented project, because a real one cannot be put
> into every state worth showing. The interface is real and unretouched. Run the command
> above in your own repository to see yours.

## Why

When two people work an OpenSpec project together, there is no cheap way to see what specs
exist, which changes are in flight, or what a teammate just pushed. You either read a
sprawl of nested markdown by hand, or you ask an AI agent and spend tokens summarizing
files that are already sitting on your disk.

specdeck answers those questions from the filesystem and from git.

## Running it

```bash
npx specdeck@latest                         # the folder you are in
npx specdeck@latest ../some-other-project   # a specific folder
npx specdeck@latest --port 4000 --no-open   # pick a port, skip the browser
npm i -g specdeck                           # or install it as a real command
```

Use `@latest` rather than a bare `npx specdeck`. npx caches by the exact text you type, so
a bare name keeps serving whatever it fetched the first time and never checks for a newer
release.

**Requirements.** Node 20.19 or newer. git is optional: without it you lose sync state and
timelines, and everything else still works.

## What you get

### The board updates as your agent works

Your agent writes to `tasks.md` and the card moves. Nothing to refresh, no polling loop
you have to think about.

![A card moving from Ready to In Progress to Done as tasks are ticked in a file on disk](docs/media/live-update.gif)

Lanes are derived from which artifacts exist and how many tasks are ticked. There is no
status field to keep in sync, because there is no status field at all.

### What a teammate pushed, before you pull it

The board reads git as well as the filesystem. A change that exists on the remote but not
in your checkout appears as a greyed card you can pull. Alongside it: what you have not
committed, and what you have not pushed.

Remote state is whatever your last fetch saw, and the board always says how old that is.

### Every task, grouped and counted

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/change-tasks-dark.png">
  <img alt="The detail panel for a change, showing task group and task progress and a collapsible breakdown" src="docs/media/change-tasks-light.png">
</picture>

Finished groups collapse themselves, so a long list shows you what is left rather than
what is done. Ticking a checkbox writes it back to `tasks.md`. If an agent rewrote the file
since the board read it, the write is refused rather than clobbering its work.

A change also has Overview, Specs, and Timeline tabs, plus Problems when there is something
to report.

### Your specs, and what is changing them

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/specs-dark.png">
  <img alt="The specs view, listing capabilities with their requirements and scenarios, and which changes touch each one" src="docs/media/specs-light.png">
</picture>

Requirements and scenarios are parsed and shown in full. Each capability names the changes
currently modifying it, so you can see what is about to move before it does.

### Every project you have opened

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/projects-dark.png">
  <img alt="The projects view, showing three projects with lane breakdowns, task totals and sync state" src="docs/media/projects-light.png">
</picture>

Lane breakdown, task totals, sync state, and last commit for each. Star the ones you care
about, drag the rest into whatever order you like, or sort by name, activity, or work
remaining. Opening a folder uses your operating system's own picker.

### Handoff back to your agent

specdeck detects which AI tools your project has OpenSpec wired into, and hands work off
using the command OpenSpec itself generated. It can open a terminal, open an existing
agent session, or copy the prompt, and it tells you which of those it did.

### A folder with no OpenSpec in it

Point specdeck at one and it offers to set it up, with a tool picker and the exact command
shown next to the button, so you can run it yourself instead if you prefer.

## Design principles

These are load bearing, not decoration. They explain most of the product's behavior.

**Everything is derived, nothing is stored.** specdeck keeps no status field, no sidecar
progress database, and no directory OpenSpec does not own. If the board says a change is in
progress, that is because its tasks file says so. Edit files outside specdeck and the board
simply agrees with you.

**specdeck writes nothing into your repository.** Its configuration and your project
registry live in `~/.specdeck/`. The only files that ever appear in your repo are real
OpenSpec artifacts, produced by real OpenSpec commands. There is a test that asserts the
tree is byte identical after a full scan.

**It never claims to know more than it does.** Local state is live. Remote state is a
snapshot from your last fetch, and the board always tells you how old it is. When a
comparison cannot be performed, indicators are hidden rather than defaulted to "in sync".

**Failures are readable.** When something fails you get the command, the exit status, and
the real output, not a spinner and not a paraphrase.

## What it will not do

- Move a card between lanes. Lanes come from your files, so a drag would be undone on the
  next read. Only archiving is a real action, and it is the only drag that exists.
- Pull anything but a fast-forward. If your branch and the remote have both moved, specdeck
  stops and tells you rather than creating a merge commit.
- Browse repositories you have not cloned. That is a different product.
- Call a language model. Answering these questions cheaply is the entire point.

## Supported AI tools

Detected from the files `openspec init` generates: Claude Code, Cursor, Windsurf, opencode,
Gemini CLI, GitHub Copilot, Kilo Code, and Roo Code.

Codex is reported as undetectable rather than absent, because it keeps its commands in your
home folder rather than in the project, so there is nothing in the repository to look at.

Any other tool still works. Handoff falls back to copying the prompt, which is the path
that gets the most polish precisely because it works everywhere.

A CI job initializes every supported tool in a throwaway directory and fails if OpenSpec
starts generating files somewhere specdeck does not expect, because that failure is
otherwise silent.

These are other people's product names, used to say what specdeck works with. No
affiliation or endorsement is implied.

## Known limitations

- Handoff can open a terminal or an existing agent session, but only for tools it knows how
  to start. Anything else falls back to copying the prompt and says which method it used,
  so a fallback is visible rather than silent.
- Attaching to a session opens it with the prompt on your clipboard. There is no verified
  way to push a message into a running conversation, so it does not pretend to.
- Timelines need git. Without a repository, dates fall back to file modification times,
  which do not survive a clone, and the interface says the values are approximate.
- The client is a single served HTML document with no build step. That keeps `npx specdeck`
  free of a bundler step, but it will want a real build if the interface grows much.
- specdeck is young. It is used daily on this repository and tested on Linux, macOS, and
  Windows, but it has not been through many hands yet.

## Contributing

```bash
git clone https://github.com/AidanFeess/specdeck.git
cd specdeck
npm install
npm run verify
```

`npm run verify` runs formatting, linting, type checking, and tests, which is exactly what
CI runs, on Linux, macOS, and Windows against Node 20.19 and Node 24.

specdeck is built with OpenSpec, tracking its own development. This is its own board,
captured from this repository:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/self-board-dark.png">
  <img alt="specdeck showing its own repository: one change ready to implement and two finished" src="docs/media/self-board-light.png">
</picture>

`openspec/changes/` holds what is planned and how far along it is, and the design document
of any change records the decisions and the alternatives that were rejected. That is the
fastest way into the codebase.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch model and how a release is cut.

The screenshots above are generated, not hand captured. `scripts/capture/` builds the demo
projects and drives a headless browser, so they can be regenerated after an interface
change instead of quietly going stale.

## License

MIT. See [LICENSE](LICENSE).
