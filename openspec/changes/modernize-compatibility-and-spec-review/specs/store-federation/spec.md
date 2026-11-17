## MODIFIED Requirements

### Requirement: Workspaces and context stores are discovered from OpenSpec itself
The system SHALL obtain stores and personal worksets from OpenSpec 2 listing commands, without maintaining a parallel registry. Legacy workspace metadata remains readable where its schema is available.

#### Scenario: Workspaces and stores are registered on the machine
- **WHEN** the projects view reads OpenSpec registrations
- **THEN** current stores and worksets are listed using identities reported by OpenSpec
- **AND** retired workspace commands are not run

#### Scenario: None are registered
- **WHEN** no store or workset is registered
- **THEN** the dashboard shows registered projects alone
- **AND** nothing suggests the project is misconfigured

### Requirement: A selector spans every root the user can open
The system SHALL allow opening registered projects, stores, and individual workset member folders, and SHALL not represent a workset as a project root.

#### Scenario: User switches roots
- **WHEN** a user selects a different root or workset member folder
- **THEN** the board and list show that root's changes
- **AND** the selection persists across restarts

#### Scenario: Root cannot be opened
- **WHEN** a selected root cannot be resolved on this machine
- **THEN** the reason is shown
- **AND** the other roots remain usable

### Requirement: Store health is reported from OpenSpec's own checks
The system SHALL derive store health from openspec store doctor and SHALL not infer workset member health from a listing.

#### Scenario: Diagnostic reports a problem
- **WHEN** a store diagnostic reports a problem
- **THEN** its badge and diagnostic messages identify the problem

#### Scenario: Diagnostic reports no problems
- **WHEN** a store diagnostic reports no problems
- **THEN** no problem badge is shown

#### Scenario: Diagnostic cannot run
- **WHEN** store diagnostics cannot be read
- **THEN** health remains unknown
- **AND** the reason is available

## REMOVED Requirements

### Requirement: A change can be linked to an initiative from the dashboard
**Reason**: OpenSpec 2 removed the initiative linking command.
**Migration**: Preserve existing metadata and grouping. Hide new-link controls and explain the retired command if the legacy API is requested.
