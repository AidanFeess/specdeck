## Context

The projects view renders a grid of cards from `/api/overview`, which returns one entry
per registered project plus the active one. Order comes from whatever the registry
happens to hold, which is insertion order.

Two existing behaviors constrain the design. The registry lives in specdeck's own
configuration directory rather than in any repository, so ordering and starring are
per-user preferences and must stay there. And the whole view is rebuilt on every state
update, so any interaction state has to survive a rebuild.

## Goals / Non-Goals

**Goals:**

- A deliberate arrangement that survives restarts
- Sorting that never fights a deliberate arrangement
- A filter that behaves the way the same box behaves on other views
- Header chrome that suits the view being shown

**Non-Goals:**

- Grouping, tagging, or folders. Starring plus ordering covers the actual need.
- Syncing order between machines. This is a local preference, like window position.
- Sorting starred projects. That is the point of starring them.

## Decisions

### Order is an explicit integer, not array position

Each registry entry gains an optional `order` number. Position in the array is not used
as the order, because the array is also rewritten by unrelated operations such as adding
and removing projects, and an implicit order would then shuffle for reasons the user
cannot see.

Entries without an `order` sort after entries with one, in their existing sequence. That
means an existing configuration file opens looking exactly as it does today, and only
starts differing once the user actually drags something.

### Starring is a partition, not a sort key

Starred projects always occupy the top of the list, and sorting is applied only to the
unstarred remainder. Sorting the starred group would defeat the reason for starring: the
user has already said what order those should be in.

Within the starred group the manual order applies. Within the unstarred group the
selected sort applies, defaulting to manual order.

### Sort is a view preference, not a stored property

The chosen sort persists in the browser rather than in the configuration file, alongside
theme and collapsed task groups. It describes how this person is looking at the list
right now, not something about the projects, and storing it in the registry would push a
transient view choice into the same file that holds real state.

### The filter resets on view change

The filter box is shared across board, specs, and projects. Carrying a filter across a
view switch is how a user ends up staring at an empty board wondering what broke, so
switching views clears it. This matches what the box already appears to do, since it
currently has no effect on the projects view at all.

### Drag is acceptable here, unlike on the board

The board deliberately refuses dragging between lanes, because lanes are derived from
files and a drag would be undone on the next read. That reasoning does not apply here:
project order is a stored preference with nothing to contradict it, so a drag is direct
manipulation of the actual thing rather than theatre.

### The counts chip is hidden rather than emptied

Today the chip is emptied on the projects view but still rendered, which leaves a small
blank pill. It is hidden instead. On the specs view the chip keeps its meaning, since
there is still one project whose changes and capabilities are being counted, so it stays.

### Opening a document asks rather than guesses

The current behavior tries the editor environment variables, then the operating system's
file association. On a Windows machine with no association for markdown, which is the
default, that ends in the file being handed to something that never appears. The user is
given no way to say what they wanted.

specdeck instead detects which editors are actually installed and asks. Detection looks
on PATH first, then in the conventional install locations for the common editors, since
a graphical editor is frequently not on PATH even when it is installed.

The choice is remembered only if the user says so, and the dialog says which application
it will use next time. A remembered choice is a global preference rather than per
project, because it describes the person, not the repository.

The system default remains an option, so a user whose associations do work is not forced
to pick an application they did not need to think about.

### Settings live behind the product name, not in a modal nobody finds

Preferences are reachable from a settings screen alongside the other views, rather than
only from the dialog that happens to set them. A preference that can only be changed by
triggering the action it governs is a preference the user cannot undo.

The same screen holds the handoff method, which currently can only be changed from
inside the handoff sheet for the same reason.

## Risks / Trade-offs

**Drag and drop is fiddly to get right and easy to make inaccessible.** Reordering must
also be possible from the keyboard, or the feature is unavailable to anyone not using a
mouse. Move-up and move-down controls on a focused card cover this without a full drag
and drop accessibility implementation.

**A rebuild mid-drag would drop the interaction.** The view re-renders whenever a
filesystem event arrives, which during an active agent is every few seconds. Re-rendering
while a card is being dragged would cancel it, so renders are deferred until the drag
finishes.

**Detecting editors by scanning install locations will miss some.** A user with an
editor in an unusual place, or one specdeck has never heard of, must still be able to
name it. The dialog therefore accepts a command or a path directly rather than offering
only what was found.

**A remembered editor can become wrong.** An application gets uninstalled or moved, and
a preference that silently fails is worse than no preference. A remembered choice that
can no longer be launched reports what it tried and reopens the picker, rather than
failing quietly the way the current behavior does.

**Two sources of ordering can disagree.** A project can carry an `order` from a previous
arrangement and then be hidden by a filter or resorted, which makes the next drag
ambiguous: is the user reordering what they see, or the underlying list? Dragging is
therefore only offered when the manual sort is active, and selecting another sort makes
the list read-only until the user switches back.

## Migration Plan

Both new fields are optional and absent from existing configuration files, so no
migration runs and no file is rewritten until the user stars or reorders something.

An older specdeck reading a newer configuration ignores fields it does not recognise,
because the config reader already discards unknown keys rather than failing on them.

## Open Questions

- Should the sort control also appear when only one or two projects are registered, or
  stay hidden until the list is long enough for sorting to matter?
