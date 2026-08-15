## ADDED Requirements

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
