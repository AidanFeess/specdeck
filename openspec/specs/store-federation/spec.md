# store-federation Specification

## Purpose

Discovering the workspaces and context stores OpenSpec itself knows about, opening any root the user has, and grouping changes by the initiative they belong to.

## Requirements
### Requirement: Workspaces and context stores are discovered from OpenSpec itself
The system SHALL obtain the set of OpenSpec workspaces and context stores from OpenSpec's own
listing commands, and SHALL NOT maintain a parallel record of what exists.

#### Scenario: Workspaces and stores are registered on the machine
- **WHEN** the dashboard loads
- **THEN** the workspaces and context stores OpenSpec knows about are listed
- **AND** each is shown with the identity OpenSpec reports for it

#### Scenario: None are registered
- **WHEN** no workspace or context store is registered on the machine
- **THEN** the dashboard shows registered projects alone
- **AND** nothing suggests the project is misconfigured

### Requirement: A selector spans every root the user can open
The system SHALL present registered projects, workspaces, and context stores in one
selector, and SHALL indicate which kind each root is.

#### Scenario: User switches roots
- **WHEN** a user selects a different root
- **THEN** the board and list show that root's changes
- **AND** the selection persists across restarts

#### Scenario: Root cannot be opened
- **WHEN** a selected root cannot be resolved on this machine
- **THEN** the reason is shown
- **AND** the other roots remain usable

### Requirement: Store health is reported from OpenSpec's own checks
The system SHALL show per-root health from OpenSpec's workspace and context-store diagnostic
commands, and SHALL show nothing rather than a healthy state when a check cannot run.

#### Scenario: Diagnostic reports a problem
- **WHEN** a root's diagnostic reports a problem
- **THEN** the root carries a health badge naming the problem
- **AND** the diagnostic's own output is available in full

#### Scenario: Diagnostic reports no problems
- **WHEN** a root's diagnostic reports no problems
- **THEN** no problem badge is shown for it

#### Scenario: Diagnostic cannot run
- **WHEN** a root's diagnostic cannot be run
- **THEN** no health state is shown for that root
- **AND** the reason is available

### Requirement: Health is not conveyed by color alone
The system SHALL convey every health state with a glyph and text in addition to any color.

#### Scenario: Color is unavailable to the user
- **WHEN** a user cannot distinguish the badge colors
- **THEN** the glyph and text still identify the state

### Requirement: Changes are grouped by the initiative they belong to
The system SHALL read each change's initiative link from its OpenSpec metadata and SHALL
offer grouping by initiative across roots.

#### Scenario: Changes across repositories share an initiative
- **WHEN** changes in more than one root are linked to the same initiative
- **THEN** grouping by initiative shows them together
- **AND** each change still shows which root it lives in

#### Scenario: Change has no initiative
- **WHEN** a change is linked to no initiative
- **THEN** it is grouped as unlinked rather than hidden

### Requirement: A change can be linked to an initiative from the dashboard
The system SHALL link a change to an initiative by running OpenSpec's own metadata command,
and SHALL NOT write the link itself.

#### Scenario: User links a change
- **WHEN** a user links a change to an initiative
- **THEN** OpenSpec's metadata command performs the link
- **AND** the change's grouping updates without a manual refresh

#### Scenario: Link fails
- **WHEN** the link command fails
- **THEN** the command, exit status, and output are shown
- **AND** the change's grouping is unchanged

