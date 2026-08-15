## ADDED Requirements

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
