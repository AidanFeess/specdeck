## Context

The repository is public, published to npm, and has zero stars. The README is prose
only, the GitHub description and topics are unset, and `main` is unprotected while also
being the branch releases are tagged from.

Research during the MVP found nine other OpenSpec user interfaces and a best-in-class
attach rate of roughly 0.23% of the core tool's downloads. This is a small pond where
being the obvious answer matters more than reach, and where a reader deciding in ten
seconds is the normal case.

## Goals / Non-Goals

**Goals:**

- Show the product rather than describe it
- Make every README claim verifiable against the software as it exists
- Publish nothing that should not be public
- Separate work from released state at the repository level

**Non-Goals:**

- Marketing copy, badge walls, or a landing page.
- Comparisons against the other OpenSpec interfaces. Naming competitors to rank
  ourselves is a bad look and invites arguments rather than users.
- A documentation site. The README is the whole surface at this size.

## Decisions

### Screenshots come from a real project, and a purpose-made one

The board is captured against a repository with genuine history, because a screenshot of
an empty board demonstrates nothing. specdeck's own repository is the honest subject: it
is public, it is the tool tracking itself, and every path in it is already visible.

Sync chips need states this repository does not currently have, such as a teammate's
unpulled change. Those are captured from a purpose-built repository whose contents are
invented, rather than from anything real and private.

### Media is reviewed before it is committed, not after

A screenshot is a picture of a real screen and can carry a window title, a file path
containing a user name, a browser tab from another site, or a token in a terminal. Every
captured image is inspected specifically for that before being added, and the capture
uses a clean window rather than whatever happened to be open.

This is the reason to prefer cropped captures of the application over full-desktop
screenshots.

### Claims are checked against behavior, one at a time

Every capability sentence in the README is checked against the software before it ships.
Anything that is aspirational is either removed or marked as not yet implemented. The
README already carried two claims that had gone stale within a day, which is how fast
this happens when nobody is checking.

Specifically: no performance numbers that have not been measured, no compatibility claims
for tools that have not been run, and no statement about what other projects do.

### Legal exposure is small but real, and comes from three places

Trademarks: OpenSpec, GitHub, Claude, Cursor and the rest are other people's names. They
are used descriptively, to say what specdeck works with, and never as branding or in a
way implying endorsement. No third-party logos are used, since a logo is the part that
actually carries trademark risk.

Licensing: any image or font that is not produced here is not used. Everything shown is
either the application itself or text written for it.

Claims: the risk in a README is saying something untrue about what the software does or
about someone else's software. The check above covers the first. Not mentioning
competitors covers the second.

The license is MIT and stays MIT, which is already the most permissive reasonable choice
and disclaims warranty.

### Branch model: work on `dev`, release from `main`

`main` becomes protected and is what npm publishes from. `dev` becomes the default branch
for work, merged into `main` when a release is cut.

Protection must permit the release flow to keep working, which means the rules cannot
block tag pushes, and a rule requiring pull requests has to allow the repository owner to
merge their own since there is currently no second reviewer. Protection that a solo
maintainer has to fight is protection that gets switched off.

Required status checks are the part with real value: CI must pass before anything reaches
the branch that publishes.

## Risks / Trade-offs

**A recording dates quickly.** Any interface change makes it subtly wrong, and a stale
demo is worse than none because it advertises a version that no longer exists. It is kept
short and focused on behavior that is unlikely to change, rather than on layout.

**Binary assets bloat a repository permanently.** Images cannot be removed from git
history without a rewrite, so they are compressed before committing and kept to a small
number. They are excluded from the published package, which ships only `dist`.

**Branch protection can lock out the person who set it up.** Rules are applied and then
the release path is exercised, rather than assumed to still work. Getting this wrong
means discovering at release time that the tag cannot be pushed.

**Screenshots of a real machine are the highest risk item here.** The mitigation is
inspection before committing, and the fallback is that anything published can be removed
from the working tree but not from history, so the review has to happen first.

## Migration Plan

No product behavior changes, so nothing to migrate and nothing for a user to do.

The branch change is the only sequenced part: create `dev` from `main`, make it the
default, then apply protection to `main`, then confirm a tag push still triggers a
release before relying on it.

## Open Questions

- Should the recording live in the repository, or be hosted so the repository stays
  light? A file in the repository is simpler and survives a host disappearing, at the
  cost of permanent weight in history.
- Is a `dev` branch worth the ceremony for a single maintainer, or is protecting `main`
  and working on short-lived branches per change sufficient?
