# Contributing to specdeck

Thanks for considering it. This document covers the workflow and the few conventions
that are worth knowing before you write code.

## Getting set up

```bash
git clone https://github.com/AidanFeess/specdeck.git
cd specdeck
npm install
npm run verify
```

`npm run verify` runs formatting, linting, type checking, and tests. It is exactly what
CI runs, so if it passes locally it should pass on the pull request.

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

## The client has a build step

The client lives in `src/client/` as plain JavaScript modules, bundled by esbuild into a
single self-contained document that the server inlines. `npm run build:client` produces
it, and `npm test` runs it first, so a fresh clone needs no extra step.

Two things follow from that arrangement, and both are deliberate:

- **The client is JavaScript, not TypeScript.** It is bundled rather than compiled, so it
  sits outside the type-checked project. `no-undef` is switched on for it instead, which
  is what catches a reference that was never imported. Its tests are `.test.js` and run
  under jsdom, pinned to a major whose bundled undici does not call a Node API that
  the oldest supported Node lacks.
- **Everything the client needs is a devDependency.** marked, DOMPurify, and CodeMirror
  are inlined at build time, so the published package ships the built document and
  someone running `npx specdeck` installs none of them.

The served page must never fetch anything at runtime. There is a test that asserts it.

## specdeck uses OpenSpec on itself

Work is planned as OpenSpec changes in `openspec/changes/`. Before writing code for
anything non trivial, read the relevant spec. Before proposing something new, it is
worth opening a discussion issue first so the change proposal can be written once.

Start with [the design document](openspec/changes/add-review-and-openspec-integration/design.md),
and the [archived MVP design](openspec/changes/archive/) behind it. They record the
decisions and, more usefully, why the alternatives were rejected. Most questions about
"why is it built this way" are answered there.

## Conventions that matter

**Derived state is never stored.** specdeck computes board state from files on disk. If
you find yourself adding a field that caches or overrides that, it almost certainly
belongs somewhere else. The one exception is caching keyed to a git commit, which is
invalidated when the commit changes.

**Write only what was asked for, only where OpenSpec already writes.** specdeck's own
configuration lives in its own directory, and no file of specdeck's own may ever appear
inside a managed project. The only files it writes there are OpenSpec artifacts, at paths
OpenSpec owns, and only because a user saved one. Reading a project writes nothing at all.

**Never commit on a user's behalf.** Approving is the only thing that creates a commit,
it is scoped to a single change directory so it cannot sweep in unrelated work, and it
never bypasses a hook. `src/core/read/no-writes.test.ts` asserts all of this; if you find
yourself needing to weaken it, that is the conversation to have first.

**Distinguish a missing capability from a failure.** When a feature is not implemented
for someone's setup, fall through quietly to the simpler path. When something that is
implemented is attempted and fails, say so with the real error. Silently degrading on a
genuine failure means the bug never gets reported.

**Never let an unavailable comparison read as success.** If sync state cannot be
computed, hide the indicators and explain why. Rendering "in sync" because a git command
failed is worse than rendering nothing.

**Prefer plain hyphens in prose.** This repository avoids em-dashes and en-dashes in
documentation and user facing strings.

## Adding support for another AI tool

Harness support is deliberately the easiest thing to contribute. Each adapter declares
only the handoff methods it can actually perform, and anything it does not implement
falls through to copying the prompt, which always works. You should not need to touch
the board, the parser, or the sync layer to add one.

## Branches and releases

`dev` is the default branch and where work lands. `main` is what gets released, and it is
protected: CI has to pass before anything reaches it.

```
feature branch  ->  dev  ->  main  ->  tag  ->  npm
```

Work on a branch named after the OpenSpec change you are implementing, and open the pull
request against `dev`.

A release is cut by bumping the version on `dev`, letting CI run on it, and only then
moving `main` and pushing the tag:

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

The version bump has to happen on `dev` rather than on `main`. `main` requires those
checks, and a required check is looked up by commit, so a bump committed straight onto
`main` would arrive with no check at all and be refused. Doing it this way means every
commit that reaches `main` has already passed.

The tag push is last, and it is what publishes. The release workflow verifies the tag
matches the manifest, publishes to npm with provenance through trusted publishing, and
creates the GitHub release. Branch protection covers branches rather than tags, so the tag
push is not blocked by it.

There is no second reviewer on this project yet, so the protection rules do not require an
approving review. Protection a solo maintainer has to switch off is protection that stays
off.

## Regenerating the screenshots

The images in the README are generated rather than captured by hand, so an interface change
does not quietly leave them wrong:

```bash
node scripts/capture/demo.mjs ../specdeck-demo
node dist/cli/index.js ../specdeck-demo/orbit --port 7788 --no-open
node scripts/capture/shots.mjs http://127.0.0.1:7788 docs/media
node scripts/capture/live.mjs http://127.0.0.1:7788 ../specdeck-demo/orbit docs/media/live-update.gif
```

The demo projects are invented. Captures come from a headless browser rather than a
desktop, so nothing outside the application can end up in an image. ffmpeg is used to
compress them and to build the recording; without it the captures still work and are just
larger.

## Pull requests

- Keep the change focused. One concern per pull request.
- Include tests for behavior, especially for anything touching parsing, git, or the
  watcher, where the failure modes are quiet.
- Run `npm run verify` before pushing.
- Describe what you changed and why. Link the issue or the OpenSpec change if there is one.

## Reporting bugs

Please include your operating system, Node version, OpenSpec version, and whether the
project is in a git repository. A surprising number of issues in a tool like this come
down to repository shape: worktrees, submodules, shallow clones, and line ending
settings all change behavior.
