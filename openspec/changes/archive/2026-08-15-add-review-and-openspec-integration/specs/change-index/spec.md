## ADDED Requirements

### Requirement: Changes can be read as a sortable list
The system SHALL provide a list view of changes as an alternative to the board, sortable by
name, creation date, last modification, derived lane, task progress, approval state, and
root.

#### Scenario: User sorts by a column
- **WHEN** a user sorts the list by any offered column
- **THEN** the rows are ordered by that column
- **AND** the direction can be reversed

#### Scenario: Values are missing for a column
- **WHEN** some changes have no value for the column being sorted
- **THEN** those rows are grouped together rather than treated as the lowest value
- **AND** the absence is shown as absence rather than as a zero or an epoch date

### Requirement: Archived changes are reachable in the list
The system SHALL include archived changes in the list view behind a toggle that is off by
default, and SHALL show each archived change's archive date.

#### Scenario: Archived changes are shown
- **WHEN** a user turns on the archived toggle
- **THEN** archived changes appear alongside active ones
- **AND** each is marked as archived with the date it was archived

#### Scenario: Archived changes are hidden
- **WHEN** the archived toggle is off
- **THEN** only active changes appear

### Requirement: The list can be narrowed by lane, root, initiative, and date
The system SHALL filter the list by derived lane, by root with more than one selectable at a
time, by initiative, and by a range of dates, and SHALL apply active filters together.

#### Scenario: Several filters are active
- **WHEN** a user filters by lane and by two roots at once
- **THEN** only changes matching every active filter are listed
- **AND** the active filters are visible

#### Scenario: Filters exclude everything
- **WHEN** the active filters match no changes
- **THEN** the list states that filters are excluding everything
- **AND** offers to clear them

#### Scenario: Filters are cleared
- **WHEN** a user clears the filters
- **THEN** the full list is shown

### Requirement: Creation dates come from OpenSpec metadata and their precision is not overstated
The system SHALL take a change's creation date from its OpenSpec metadata when present, SHALL
fall back to the earliest date git records for the change directory, and SHALL mark the value
as approximate whenever it did not come from the metadata.

#### Scenario: Metadata records a creation date
- **WHEN** a change's OpenSpec metadata records when it was created
- **THEN** that date is shown as the creation date

#### Scenario: Metadata records no creation date
- **WHEN** a change's metadata has no creation date and the repository has history for it
- **THEN** the earliest date git records for the change is shown
- **AND** it is marked as approximate

#### Scenario: Neither source is available
- **WHEN** a change has no recorded creation date and no git history
- **THEN** no creation date is shown for it

### Requirement: The chosen view persists
The system SHALL remember whether the user last used the board or the list, along with the
active sort and filters, and SHALL restore them on the next visit.

#### Scenario: User returns to the dashboard
- **WHEN** a user reopens the dashboard after using the list view
- **THEN** the list view is shown with the sort and filters last used

### Requirement: The list opens the same detail the board opens
The system SHALL open the same change detail from a list row as from a board card.

#### Scenario: Row is opened
- **WHEN** a user opens a change from the list
- **THEN** the same detail view opens as from the board
- **AND** closing it returns to the list with its sort and filters intact
