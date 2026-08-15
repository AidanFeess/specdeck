# openspec-model Specification

## Purpose
TBD - created by archiving change add-specdeck-mvp. Update Purpose after archive.
## Requirements
### Requirement: Lane state is derived, never stored
The system SHALL derive every change's lane from the files on disk, and SHALL NOT
write, read, or maintain any status field for a change.

#### Scenario: Lane follows artifact existence
- **WHEN** a change directory contains a proposal but no tasks file
- **THEN** the change is placed in a lane before the ready lane
- **AND** no status value is persisted anywhere

#### Scenario: Lane follows task completion
- **WHEN** a change's tasks file has some but not all checkboxes ticked
- **THEN** the change is placed in the in progress lane

#### Scenario: External edit changes the lane
- **WHEN** a user or agent edits change files outside specdeck
- **THEN** the derived lane updates to match the new files
- **AND** specdeck never contradicts what is on disk

### Requirement: Changes and specs are parsed from markdown
The system SHALL parse OpenSpec markdown directly to extract requirements, scenarios,
delta operations, and task checkboxes, rather than depending on CLI JSON output for
read paths.

#### Scenario: Delta operations are recognized
- **WHEN** a change's delta spec declares added, modified, removed, or renamed requirements
- **THEN** each requirement is attributed to its delta operation

#### Scenario: Scenarios require four hashes
- **WHEN** a requirement block contains a scenario heading with fewer than four hashes
- **THEN** the requirement is reported as having a malformed scenario
- **AND** the change is flagged rather than silently showing zero scenarios

#### Scenario: Task checkboxes are counted
- **WHEN** a tasks file contains checkbox lines
- **THEN** completed and total counts are extracted for the change

### Requirement: Archived changes are read from the archive location
The system SHALL treat changes under the archive directory as archived, and SHALL
parse the archive date from the directory name prefix.

#### Scenario: Archived change is identified
- **WHEN** a change directory sits under the changes archive directory
- **THEN** it is presented as archived
- **AND** its archive date comes from the directory name prefix

### Requirement: Parsing failures are contained
The system SHALL isolate parse failures to the affected change or spec and SHALL
continue presenting every other item.

#### Scenario: One malformed change
- **WHEN** a single change contains unparseable markdown
- **THEN** that change is shown in an error state with the reason
- **AND** all other changes render normally

