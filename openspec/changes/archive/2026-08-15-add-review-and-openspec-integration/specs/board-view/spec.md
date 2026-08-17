## ADDED Requirements

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
