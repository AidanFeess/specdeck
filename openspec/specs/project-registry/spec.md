# project-registry Specification

## Purpose

Remembering which projects have been opened, and how the person wants them presented, entirely outside the projects themselves.

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

### Requirement: Projects carry a star flag and a display order
The system SHALL store, per registered project, an optional star flag and an optional
display order, in specdeck's own configuration rather than in the project.

#### Scenario: Starring a project
- **WHEN** a user stars a project
- **THEN** the flag is stored against that project in specdeck's configuration
- **AND** no file inside the project is created or modified

#### Scenario: Reordering projects
- **WHEN** a user rearranges projects
- **THEN** an explicit order is stored for each affected project

#### Scenario: Order is explicit rather than positional
- **WHEN** a project is added or removed
- **THEN** the stored order of every other project is unchanged

### Requirement: Existing configurations keep working unchanged
The system SHALL treat the star flag and display order as optional, and SHALL NOT
rewrite an existing configuration until the user stars or reorders something.

#### Scenario: Configuration written by an earlier version
- **WHEN** a configuration containing neither field is read
- **THEN** every project loads with no star and no order
- **AND** the projects appear in the order the file lists them

#### Scenario: Configuration containing unknown fields
- **WHEN** a configuration written by a newer version is read
- **THEN** unrecognised fields are ignored
- **AND** the projects still load

### Requirement: One folder is one project however its path is spelled
The system SHALL identify a registered project by the folder its path resolves to,
rather than by the characters of the path, and SHALL leave the stored spelling as
written.

#### Scenario: Updating a project recorded with a different spelling
- **WHEN** a star or an order is set using a path that resolves to an already
  registered folder but is spelled differently
- **THEN** the existing entry is updated
- **AND** no second entry is added for the same folder

#### Scenario: Listing projects
- **WHEN** the projects view is read
- **THEN** each folder appears exactly once

#### Scenario: Stored paths are not rewritten
- **WHEN** an entry recorded with a different spelling is updated
- **THEN** its stored path is unchanged

### Requirement: The preferred editor is stored globally
The system SHALL store a remembered editor as a global preference rather than per
project, and SHALL keep it in specdeck's own configuration.

#### Scenario: Remembering an editor
- **WHEN** a user asks for an editor choice to be remembered
- **THEN** it is stored once and applies to every project

#### Scenario: No editor has been remembered
- **WHEN** no editor preference is stored
- **THEN** the configuration is unchanged from one written before this existed

