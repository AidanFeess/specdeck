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

| Script               | What it does                |
| -------------------- | --------------------------- |
| `npm run verify`     | Everything CI runs          |
| `npm run build`      | Compile to `dist/`          |
| `npm test`           | Run tests once              |
| `npm run test:watch` | Run tests in watch mode     |
| `npm run lint:fix`   | Fix what the linter can fix |
| `npm run format`     | Format the repository       |

## specdeck uses OpenSpec on itself

Work is planned as OpenSpec changes in `openspec/changes/`. Before writing code for
anything non trivial, read the relevant spec. Before proposing something new, it is
worth opening a discussion issue first so the change proposal can be written once.

Start with [the design document](openspec/changes/add-specdeck-mvp/design.md). It records
the decisions and, more usefully, why the alternatives were rejected. Most questions
about "why is it built this way" are answered there.

## Conventions that matter

**Derived state is never stored.** specdeck computes board state from files on disk. If
you find yourself adding a field that caches or overrides that, it almost certainly
belongs somewhere else. The one exception is caching keyed to a git commit, which is
invalidated when the commit changes.

**Never write into a user's repository.** specdeck's own configuration lives in its own
directory. The only files that may appear in a managed project are OpenSpec artifacts
produced by OpenSpec commands.

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
