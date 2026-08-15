## 1. Registry Storage

- [x] 1.1 Add optional star and order fields to the project entry type and the config reader, keeping both absent by default
- [x] 1.2 Add endpoints to set a project's star flag and to persist a reordering
- [x] 1.3 Assert in tests that an existing config with neither field loads unchanged and is not rewritten on read
- [x] 1.4 Assert in tests that unknown fields in a config are ignored rather than failing the load

## 2. Ordering and Sorting

- [x] 2.1 Implement the ordering rule: starred first in stored order, then unstarred by the active sort
- [x] 2.2 Implement sorting by name, by most recent activity, and by outstanding task count
- [x] 2.3 Place projects with no known activity last rather than first when sorting by activity
- [x] 2.4 Persist the chosen sort in the browser alongside the other view preferences
- [x] 2.5 Cover the ordering rule with tests, including that a sort never reorders the starred group

## 3. Projects View Interaction

- [x] 3.1 Render a star control on each project card that toggles and persists
- [x] 3.2 Render a sort control, and disable dragging whenever a sort other than manual is active
- [x] 3.3 Implement drag to reorder, persisting the new arrangement
- [x] 3.4 Implement keyboard move earlier and move later on a focused card
- [x] 3.5 Defer re-rendering while a drag is in progress so a rescan cannot cancel it
- [x] 3.6 Verify the arrangement survives a restart
- [x] 3.7 Identify a project by the folder its path resolves to, so an update changes the entry that is already there rather than appending a duplicate

## 4. Filter and Header

- [x] 4.1 Apply the header filter to the projects view by project name
- [x] 4.2 Show a no matches message rather than an empty view when nothing matches
- [x] 4.3 Clear the filter when switching views
- [x] 4.4 Hide the summary chip on the projects view, keeping it on board and specs
- [x] 4.5 Confirm the scan age chip remains visible on every view

## 5. Opening Documents

- [x] 5.1 Detect installed editors, looking on PATH first and then in the conventional install locations, since a graphical editor is often installed but not on PATH
- [x] 5.2 Store a global preferred editor in the configuration, absent by default
- [x] 5.3 Ask which application to use when opening a document and no preference is stored, offering what was detected plus the system default
- [x] 5.4 Accept a command or path typed directly, for an editor that was not detected
- [x] 5.5 Remember the choice only when the user asks, and say which application will be used next time
- [x] 5.6 Report a failure to launch with what was attempted, and reopen the picker rather than failing silently
- [x] 5.7 Report a system-default open that the operating system cannot service, rather than appearing to do nothing

## 6. Settings

- [x] 6.1 Add a settings view showing the remembered editor and the handoff method
- [x] 6.2 Allow changing or clearing the remembered editor from settings
- [x] 6.3 Allow changing the handoff method from settings, not only from the handoff sheet
- [x] 6.4 Make the product name in the header return to the projects view, reachable by keyboard

## 7. Verification

- [x] 7.1 Exercise the whole flow against several registered projects: star, drag, sort, filter, restart
- [x] 7.2 Open a document end to end: choose an editor, remember it, confirm the next open uses it, then clear it from settings
- [x] 7.3 Confirm no file is written into any managed repository by any of these actions
- [x] 7.4 Run the full verification suite and update the change status
