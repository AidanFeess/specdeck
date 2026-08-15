## MODIFIED Requirements

### Requirement: Projects are registered outside the projects themselves
The system SHALL store the project registry and all user settings in specdeck's own
configuration directory, and SHALL NOT write any file into a registered project except
OpenSpec artifacts at paths OpenSpec owns. The system SHALL make every such write either an
edit the user performed or a command the user invoked, and SHALL NOT create a commit that
the user did not ask for.

#### Scenario: Registering a project writes nothing to it
- **WHEN** a user registers a project directory
- **THEN** the registry entry is written to specdeck's own configuration directory
- **AND** the project directory contains no new or modified files

#### Scenario: Per project settings do not reach the repository
- **WHEN** a user sets a per project preference such as handoff method
- **THEN** the preference is stored against the project path in specdeck's configuration
- **AND** no file is created inside the project, gitignored or otherwise

#### Scenario: Editing an artifact writes only that artifact
- **WHEN** a user saves an edit to an artifact
- **THEN** only that artifact's file is written
- **AND** no sidecar, cache, or state file is created anywhere in the project

#### Scenario: Approval commits only the change it approves
- **WHEN** a user approves a change
- **THEN** only files inside that change's directory are staged and committed
- **AND** no commit is created by any action the user did not invoke

## ADDED Requirements

### Requirement: The registry holds roots of more than one kind
The system SHALL record each registered root's kind, distinguishing a plain project directory
from an OpenSpec workspace and from an OpenSpec context store, and SHALL keep resolving a
root recorded before kinds existed as a plain project directory.

#### Scenario: A workspace is registered
- **WHEN** a user registers an OpenSpec workspace as a root
- **THEN** the registry records it as a workspace
- **AND** the dashboard resolves it through OpenSpec's workspace commands

#### Scenario: An existing registry is read
- **WHEN** a registry written before roots had kinds is read
- **THEN** every entry in it resolves as a plain project directory
- **AND** no entry is dropped

### Requirement: Registering a root never registers it with OpenSpec
The system SHALL treat OpenSpec's own workspace and context-store registrations as the
authority, and SHALL NOT create, modify, or remove them when a root is added to or removed
from specdeck's registry.

#### Scenario: Root is removed from specdeck
- **WHEN** a user removes a workspace root from specdeck's registry
- **THEN** the workspace remains registered with OpenSpec
- **AND** no OpenSpec command is run

#### Scenario: Root is registered in specdeck
- **WHEN** a user adds a workspace root to specdeck's registry
- **THEN** OpenSpec's own registration is left untouched
