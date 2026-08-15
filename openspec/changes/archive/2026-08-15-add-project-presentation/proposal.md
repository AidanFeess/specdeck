## Why

specdeck is a visual tool whose README contains no images. Everything worth showing,
a card moving as an agent writes a file, a teammate's change appearing as a ghost you
can pull, is currently only described in prose. A reader has to take it on faith.

The repository is also unfinished as a public artifact: no description, no topics, and
no branch protection, so the single line GitHub shows in search results is blank and
anything can land directly on the branch that publishes to npm.

## What Changes

- Real screenshots of the board, the change detail panel, and the projects view
- A short recording of the live update behavior, since that is the one thing prose
  cannot convey
- The top of the README rewritten around them, following the conventions well regarded
  open source projects actually use rather than invented ones
- Every claim in the README checked against what the software does, with anything not
  yet true stated as not yet true
- Captured media reviewed so it leaks nothing: no tokens, no private repository names,
  no personal paths beyond what is unavoidable
- Repository description and topics set, so the project is findable
- A `dev` branch as the default target for work, with `main` protected and released from

## Capabilities

### New Capabilities
- `release-process`: what must be true before code is released, what the published
  package may contain, and what published material may not carry

### Modified Capabilities

None. The readme prose itself is not specified, because writing is not behavior. Only
the parts that can regress are: branch protection, package contents, and the rule that
documented claims match what the software does.

## Impact

Affects the README, a new directory of image assets, and repository settings on GitHub.

No source code changes, so no release is strictly required. The assets add weight to the
repository but not to the published package, which ships only `dist`, the README, and
the license.

Two things need care rather than speed. Screenshots capture a real screen, so they can
carry information that should not be published, and that has to be checked deliberately
rather than assumed. And branch protection on `main` changes how releases are cut, since
the release workflow triggers on tags pushed to it, so the protection rules must permit
tags and the workflow must keep working.
