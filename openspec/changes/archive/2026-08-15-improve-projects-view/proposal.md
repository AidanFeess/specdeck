## Why

The projects view lists every registered project in a fixed order the user cannot
influence. With more than three or four projects, the one being worked on daily is as
likely to be last as first, and there is no way to say otherwise.

Two smaller faults compound it. The filter box in the header does nothing on this
screen, so typing in it appears broken. And the counts chip, which is meaningful on the
board, renders as an empty pill here because there is no single project to count.

Opening a document has the same shape of problem. Clicking Open guesses an
application from environment variables and then from the operating system's file
association, and when neither is set, as is common on Windows for markdown, it hands the
file to something that never appears. The user is never asked and cannot state a
preference.

## What Changes

- Projects can be reordered by dragging, and the order persists
- Projects can be starred, and starred projects always sort above the rest
- Projects can be sorted by name, by last activity, or by outstanding task count
- Sorting never reorders starred projects among themselves, so a deliberate
  arrangement of favourites survives every sort
- The header filter narrows the visible projects, and resets when leaving the view
- The empty counts chip is hidden on the projects view
- Opening a document asks which application to use, offering the editors actually
  present on the machine, with an option to remember the choice
- A settings screen where that choice, and the handoff method, can be changed or cleared
- The product name in the header returns to the projects view

## Capabilities

### New Capabilities

None. This extends existing capabilities.

### Modified Capabilities
- `project-registry`: stores a per-project star flag and display order, and a global
  preferred editor
- `board-view`: the projects view gains reordering, starring, sorting, and filtering,
  the header adapts to the view being shown, and the product name navigates home
- `spec-detail`: opening a document asks which application to use rather than guessing

## Impact

Affects the projects home in the client, the configuration store that backs the
registry, and the header chips shared across views.

The configuration file gains two optional per-project fields and one optional global
preference. All are absent in existing files, so an older config keeps working, and an
older specdeck reading a newer config ignores fields it does not know.

No change to how projects are read, and no new writes into any managed repository.
