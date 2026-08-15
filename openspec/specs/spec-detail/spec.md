# spec-detail Specification

## Purpose
TBD - created by archiving change add-specdeck-mvp. Update Purpose after archive.
## Requirements
### Requirement: Every capability can be inspected in detail
The system SHALL present each capability in the main specs with its purpose, its
requirements, and each requirement's scenarios.

#### Scenario: Capability is opened
- **WHEN** a user opens a capability
- **THEN** its requirements are listed
- **AND** each requirement's scenarios are readable without opening a file

#### Scenario: Capability has no requirements
- **WHEN** a capability's spec contains no requirements
- **THEN** the capability is shown as empty rather than omitted

### Requirement: Changes and capabilities are linked in both directions
The system SHALL link each change to the capabilities it affects, and each capability to
the changes that have affected or will affect it.

#### Scenario: Change lists its capabilities
- **WHEN** a user opens a change
- **THEN** every capability it adds or modifies is listed and can be opened

#### Scenario: Capability lists its changes
- **WHEN** a user opens a capability
- **THEN** active and archived changes that touch it are listed

#### Scenario: Change names a capability that does not exist yet
- **WHEN** a change declares a capability that has no main spec
- **THEN** the capability is shown as pending creation rather than as a broken link

### Requirement: Delta operations are visible per requirement
The system SHALL show, for a change's delta specs, which requirements are added,
modified, removed, or renamed.

#### Scenario: Delta contains several operations
- **WHEN** a change's delta spec contains added and removed requirements
- **THEN** each requirement is labelled with its operation

#### Scenario: Removed requirement is inspected
- **WHEN** a user opens a removed requirement
- **THEN** its stated reason and migration are shown

### Requirement: Artifact content is viewable without leaving the interface
The system SHALL render each change artifact's content, and SHALL offer to open the
underlying file in the user's editor.

#### Scenario: Artifact is viewed
- **WHEN** a user opens a change's proposal, design, or tasks
- **THEN** the rendered content is shown

#### Scenario: Artifact is missing
- **WHEN** an artifact required by the change's schema does not exist
- **THEN** it is shown as not yet written, together with what it depends on

### Requirement: Rendered markdown cannot execute embedded scripts
The system SHALL sanitize rendered markdown so that content from spec files cannot
execute script in the interface.

#### Scenario: Spec contains embedded markup
- **WHEN** a spec file contains embedded script markup
- **THEN** the content renders as inert text

