# Contributing to specdeck

Thanks for your interest. This covers the workflow and the handful of conventions worth
knowing before you write code.

## Setup

```bash
git clone https://github.com/AidanFeess/specdeck.git
cd specdeck
npm install
npm run verify
```

`npm run verify` runs formatting, linting, type checking, and tests. It's exactly what CI
runs, so if it passes locally it should pass on the pull request.

Useful scripts:

| Script                 | What it does                   |
| ---------------------- | ------------------------------ |
| `npm run verify`       | Everything CI runs             |
| `npm run build`        | Build the client, then compile |
| `npm run build:client` | Bundle the client only         |
| `npm test`             | Run tests once                 |
| `npm run test:watch`   | Run tests in watch mode        |
| `npm run lint:fix`     | Fix what the linter can fix    |
| `npm run format`       | Format the repository          |

## The client build

The client lives in `src/client/` as plain JavaScript modules. esbuild bundles it into a
single self-contained HTML document that the server inlines. `npm run build:client`
produces it, and `npm test` runs it first, so a fresh clone needs no extra step.

Two things about this setup are deliberate:

- **The client is JavaScript, not TypeScript.** It's bundled rather than compiled, so it
  sits outside the type-checked project. `no-undef` is enabled for it instead, which
  catches references that were never imported. Client tests are `.test.js` and run under
  jsdom (pinned to a major that works on the oldest supported Node).
- **Everything the client needs is a devDependency.** marked, DOMPurify, and CodeMirror
  are inlined at build time, so the published package ships the built document and
  someone running `npx specdeck` installs none of them.

The served page must never fetch anything at runtime. There's a test asserting that.

## specdeck uses OpenSpec on itself

Work is planned as OpenSpec changes in `openspec/changes/`. Before writing code for
anything non-trivial, read the relevant spec. Before proposing something new, consider
opening a discussion issue first so the change proposal only has to be written once.

Start with [the design document](openspec/changes/add-review-and-openspec-integration/design.md)
and the [archived MVP design](openspec/changes/archive/) behind it. They record the
decisions made and why the alternatives were rejected, which answers most "why is it
built this way" questions.

## Conventions

**Derived state is never stored.** specdeck computes board state from files on disk. If
you find yourself adding a field that caches or overrides that, it probably belongs
somewhere else. The one exception is caching keyed to a git commit, invalidated when the
commit changes.

**Write only what was asked for, only where OpenSpec already writes.** specdeck's own
configuration lives in its own directory, and no specdeck file may ever appear inside a
managed project. The only files it writes there are OpenSpec artifacts, at paths OpenSpec
owns, and only because a user saved one. Reading a project writes nothing at all.

**Never commit on a user's behalf.** Approving is the only thing that creates a commit.
It's scoped to a single change directory so it can't sweep in unrelated work, and it
never bypasses a hook. `src/core/read/no-writes.test.ts` asserts all of this; if you need
to weaken that test, open a discussion first.

**Distinguish a missing capability from a failure.** When a feature isn't implemented for
someone's setup, fall through quietly to the simpler path. When something that is
implemented fails, say so with the real error. Silently degrading on a genuine failure
means the bug never gets reported.

**Never let an unavailable comparison read as success.** If sync state can't be computed,
hide the indicators and explain why. Showing "in sync" because a git command failed is
worse than showing nothing.

**Prefer plain hyphens in prose.** This repository avoids em-dashes and en-dashes in
documentation and user-facing strings.

## Adding support for another AI tool

Harness support is deliberately the easiest thing to contribute. Each adapter declares
only the handoff methods it can actually perform, and anything it doesn't implement falls
through to copying the prompt, which always works. You shouldn't need to touch the board,
the parser, or the sync layer to add one.

## Branches and releases

`dev` is the default branch and where work lands. `main` is what gets released, and it's
protected: CI has to pass before anything reaches it.

```
feature branch  ->  dev  ->  main  ->  tag  ->  npm
```

Name your branch after the OpenSpec change you're implementing and open the pull request
against `dev`.

A release is cut by bumping the version on `dev`, letting CI run, and only then moving
`main` and pushing the tag:

```bash
git checkout dev
npm version minor        # updates package.json, commits, and creates the tag
git push origin dev      # without the tag, so CI runs first

# wait for CI to pass on dev, then:
git checkout main
git merge --ff-only dev
git push origin main
git push origin v0.2.0   # this is what triggers publishing
```

The version bump has to happen on `dev`. `main` requires status checks, and a required
check is looked up by commit, so a bump committed straight onto `main` would arrive with
no check attached and be refused. Doing it this way means every commit that reaches
`main` has already passed CI.

The tag push is what publishes. The release workflow verifies the tag matches the
manifest, publishes to npm with provenance through trusted publishing, and creates the
GitHub release. Branch protection covers branches, not tags, so the tag push isn't
blocked by it.

There's no second maintainer yet, so the protection rules don't require an approving
review; a rule the solo maintainer would have to bypass every time would just end up
switched off.

## Regenerating the screenshots

The README images are generated rather than hand-captured, so a UI change doesn't
quietly leave them stale:

```bash
npm run build
node scripts/capture/demo.mjs ../specdeck-demo
node scripts/capture/registry.mjs ../specdeck-demo ../specdeck-demo/.specdeck-config

export SPECDECK_CONFIG_DIR=../specdeck-demo/.specdeck-config
node dist/cli/index.js ../specdeck-demo/orbit --port 7788 --no-open

node scripts/capture/shots.mjs http://127.0.0.1:7788 docs/media
node scripts/capture/live.mjs http://127.0.0.1:7788 ../specdeck-demo/orbit docs/media/live-update.gif
```

`SPECDECK_CONFIG_DIR` is not optional. The projects view reads specdeck's own registry,
so capturing against your real one would publish your username, your project names, and
their paths on disk. Pointing it at the generated registry keeps the images identical for
everybody.

The self-specs image is the specs view captured against this repository rather than the
demo, which is what the extra arguments are for:

```bash
node dist/cli/index.js . --port 7789 --no-open
node scripts/capture/shots.mjs http://127.0.0.1:7789 docs/media specs self-specs
```

The demo projects are invented, and captures come from a headless browser, so nothing
outside the application can end up in an image. ffmpeg is used for compression and for
the GIF; without it the captures still work, just larger.

The capture scripts drive the interface through `window.specdeck`, which the client
exposes for exactly this. The client is bundled, so its internals live inside a closure;
naming what automation may touch means renaming an internal variable can't silently break
the images.

## Pull requests

- Keep the change focused: one concern per pull request.
- Include tests for behavior, especially anything touching parsing, git, or the watcher,
  where failures are quiet.
- Run `npm run verify` before pushing.
- Describe what you changed and why, and link the issue or OpenSpec change if there is
  one.

## Reporting bugs

Please include your operating system, Node version, OpenSpec version, and whether the
project is in a git repository. A surprising number of issues in a tool like this come
down to repository shape: worktrees, submodules, shallow clones, and line-ending settings
all change behavior.
