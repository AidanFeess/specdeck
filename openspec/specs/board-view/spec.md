# board-view Specification

## Purpose

Presenting active changes in lanes derived from their files, and offering the next real action on each rather than a drag target that the next read would undo.
## Requirements
### Requirement: Changes are presented in lanes derived from their files
The system SHALL present active changes in lanes ordered by workflow progression, and
SHALL place each change according to its derived state.

#### Scenario: Board renders lanes
- **WHEN** a project with changes in several states is opened
- **THEN** each change appears in the lane matching its derived state
- **AND** each card shows its completed and total task counts

#### Scenario: Board starts at the first real state
- **WHEN** the board is rendered
- **THEN** no lane exists for work that has no representation on disk

### Requirement: Cards offer the next action rather than a drag target
The system SHALL present a primary action on each card labelled with the next step
reported by OpenSpec for that change, and SHALL open the handoff view when it is used.

#### Scenario: Change needs its next artifact
- **WHEN** a change is missing an artifact that its schema requires
- **THEN** the card's primary action names the step that produces it
- **AND** using the action opens the handoff view for that artifact

#### Scenario: Action is reachable without a pointer
- **WHEN** a user navigates the board by keyboard
- **THEN** each card's primary action can be reached and used

### Requirement: Only archiving is performed by dragging
The system SHALL allow a change whose tasks are complete to be dragged to archive, and
SHALL NOT allow dragging between derived lanes.

#### Scenario: Drag to archive
- **WHEN** a user drags a change with all tasks complete onto the archive target
- **THEN** a confirmation is shown before anything is archived

#### Scenario: Drag attempted between derived lanes
- **WHEN** a user attempts to drag a card between derived lanes
- **THEN** the card does not move
- **AND** the interface explains that lanes are derived from files

### Requirement: Archiving requires informed confirmation
The system SHALL show incomplete task counts and validation results before archiving,
and SHALL report the outcome of the archive command.

#### Scenario: Change has incomplete tasks
- **WHEN** a user archives a change with unticked tasks
- **THEN** the number of incomplete tasks is shown before confirming

#### Scenario: Archive fails
- **WHEN** the archive command exits with a failure
- **THEN** the command output is shown
- **AND** the board reflects the actual on disk state afterwards

### Requirement: Sync state is summarized on the card and detailed on demand
The system SHALL show counted sync indicators on each card, SHALL render nothing when a
change is fully in sync, and SHALL provide per artifact detail on demand.

#### Scenario: Change is fully in sync
- **WHEN** a change matches the remote and has no uncommitted work
- **THEN** no sync indicator is rendered on its card

#### Scenario: Change has mixed sync state
- **WHEN** a change has some uncommitted files and some committed but unpushed files
- **THEN** the card shows a count for each condition

#### Scenario: Per artifact detail is requested
- **WHEN** a user focuses or hovers a sync indicator
- **THEN** each artifact's individual sync state is listed with text labels

### Requirement: Sync indication does not rely on color alone
The system SHALL convey every sync state with a glyph and text in addition to any color.

#### Scenario: Color is unavailable to the user
- **WHEN** a user cannot distinguish the indicator colors
- **THEN** the glyph, count, and text still identify each state

### Requirement: Projects can be arranged deliberately
The system SHALL allow a user to rearrange projects on the projects view, and SHALL
apply that arrangement whenever the manual order is in effect.

#### Scenario: Dragging a project to a new position
- **WHEN** a user drags a project card to another position
- **THEN** the list reflects the new arrangement
- **AND** the arrangement survives restarting specdeck

#### Scenario: Rearranging without a pointer
- **WHEN** a user focuses a project card by keyboard
- **THEN** controls to move it earlier or later are available and operable

#### Scenario: A rescan arrives mid drag
- **WHEN** the projects view is re-rendered while a card is being dragged
- **THEN** the drag is not interrupted

### Requirement: Starred projects stay at the top
The system SHALL place starred projects above every unstarred project, and SHALL NOT
reorder starred projects when a sort is applied.

#### Scenario: Sorting with starred projects present
- **WHEN** a sort is applied
- **THEN** starred projects remain above the unstarred ones
- **AND** the order of the starred projects is unchanged

#### Scenario: Unstarring a project
- **WHEN** a user unstars a project
- **THEN** it moves into the unstarred group and is subject to the current sort

### Requirement: Projects can be sorted
The system SHALL offer sorting by name, by most recent activity, and by outstanding task
count, in addition to the manual arrangement.

#### Scenario: Sorting by name
- **WHEN** the user sorts by name
- **THEN** unstarred projects are ordered alphabetically

#### Scenario: Sorting by most recent activity
- **WHEN** the user sorts by activity
- **THEN** unstarred projects are ordered with the most recently worked first
- **AND** projects with no known activity sort last rather than first

#### Scenario: Sorting by outstanding work
- **WHEN** the user sorts by outstanding tasks
- **THEN** unstarred projects are ordered by how many tasks remain

#### Scenario: A sort is chosen
- **WHEN** any sort other than the manual arrangement is active
- **THEN** dragging is unavailable, so the arrangement cannot be ambiguous
- **AND** returning to the manual arrangement restores the stored order

#### Scenario: The chosen sort persists
- **WHEN** a user selects a sort and reopens specdeck
- **THEN** the same sort is still selected

### Requirement: The filter applies to the view being shown
The system SHALL filter projects by name on the projects view, and SHALL clear the
filter when the user switches to another view.

#### Scenario: Filtering projects
- **WHEN** a user types into the filter on the projects view
- **THEN** only projects whose name matches remain visible

#### Scenario: Nothing matches
- **WHEN** no project matches the filter
- **THEN** the view says so rather than appearing empty

#### Scenario: Leaving the view
- **WHEN** the user switches to the board or the specs view
- **THEN** the filter is cleared

### Requirement: Header chrome suits the view being shown
The system SHALL show a summary chip only on views where it has a meaning, and SHALL
hide it rather than render it empty.

#### Scenario: Projects view
- **WHEN** the projects view is shown
- **THEN** no empty summary chip is rendered

#### Scenario: Board and specs views
- **WHEN** the board or the specs view is shown
- **THEN** the summary chip is shown with its counts

#### Scenario: Scan age
- **WHEN** any view is shown
- **THEN** the age of the last scan remains visible

### Requirement: The product name returns to the projects view
The system SHALL make the product name in the header a way back to the projects view.

#### Scenario: Clicking the product name
- **WHEN** a user clicks the product name in the header
- **THEN** the projects view is shown

#### Scenario: Reaching it without a pointer
- **WHEN** a user navigates the header by keyboard
- **THEN** the product name can be focused and activated

### Requirement: Cards show whether a change has been approved
The system SHALL show each change's approval state on its card, distinguishing approved,
needing review after approval, and never approved, and SHALL show nothing when approval state
cannot be determined.

#### Scenario: Change is approved and unchanged
- **WHEN** a change's artifacts match its approving commit
- **THEN** its card shows that it is approved
- **AND** the approver and approval time are available on the card

#### Scenario: Change was approved and has since changed
- **WHEN** an approved change's artifacts differ from the approving commit
- **THEN** its card shows that it needs review again
- **AND** the approved state is not shown alongside it

#### Scenario: Change has never been approved
- **WHEN** a change has no approval in history
- **THEN** its card shows no approval state rather than a rejected or pending one

#### Scenario: Approval state is unknown
- **WHEN** approval state cannot be determined for a change
- **THEN** no approval indicator is rendered on its card

### Requirement: Approval state is not conveyed by color alone
The system SHALL convey each approval state with a glyph and text in addition to any color.

#### Scenario: Color is unavailable to the user
- **WHEN** a user cannot distinguish the approval indicator colors
- **THEN** the glyph and text still identify the state

### Requirement: The board and the list are two views of the same changes
The system SHALL let a user switch between the board and the list view without changing which
root is open, and SHALL apply the same derived lanes in both.

#### Scenario: User switches to the list
- **WHEN** a user switches from the board to the list
- **THEN** the same changes are shown for the same root
- **AND** each change's lane is the one its card was in

#### Scenario: User switches back
- **WHEN** a user switches from the list back to the board
- **THEN** the board is shown for the same root

