# project-registry Specification

## Purpose
TBD - created by archiving change add-specdeck-mvp. Update Purpose after archive.
## Requirements
### Requirement: Projects are registered outside the projects themselves
The system SHALL store the project registry and all user settings in specdeck's own
configuration directory, and SHALL NOT write any file into a registered project except
OpenSpec artifacts produced by OpenSpec commands.

#### Scenario: Registering a project writes nothing to it
- **WHEN** a user registers a project directory
- **THEN** the registry entry is written to specdeck's own configuration directory
- **AND** the project directory contains no new or modified files

#### Scenario: Per project settings do not reach the repository
- **WHEN** a user sets a per project preference such as handoff method
- **THEN** the preference is stored against the project path in specdeck's configuration
- **AND** no file is created inside the project, gitignored or otherwise

### Requirement: Project resolution reuses OpenSpec's own logic
The system SHALL locate a project's OpenSpec planning home using the resolver functions
exported by the `@fission-ai/openspec` package rather than assuming `openspec/` sits at
the repository root.

#### Scenario: OpenSpec lives in a subdirectory
- **WHEN** a registered project keeps its OpenSpec directory below the repository root
- **THEN** specdeck resolves the correct planning home
- **AND** reads changes and specs from the resolved location

#### Scenario: Resolution fails
- **WHEN** the planning home cannot be resolved for a registered project
- **THEN** the project is shown in an unresolved state with the reason
- **AND** the rest of the registry remains usable

### Requirement: Settings resolve from project override to global default
The system SHALL resolve each user setting by taking the project level override when
present, otherwise the global default, otherwise the built in default.

#### Scenario: Project override wins
- **WHEN** a project sets handoff method to clipboard and the global default is automatic
- **THEN** handoff for that project uses clipboard
- **AND** other projects continue to use automatic

#### Scenario: Cleared override falls back
- **WHEN** a user clears a project level override
- **THEN** the project resolves that setting from the global default

