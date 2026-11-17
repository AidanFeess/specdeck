## ADDED Requirements

### Requirement: Explicitly skipped specs do not block planning
The system SHALL recognize boolean skip_specs metadata for the built-in spec-driven workflow and SHALL show a missing specs artifact as intentionally skipped rather than blocking its dependents.

#### Scenario: Nonbehavioral change skips specs
- **WHEN** skip_specs is true and no delta spec exists
- **THEN** specs are shown as skipped and do not block task readiness

#### Scenario: Skip flag is malformed
- **WHEN** skip_specs is a string instead of a boolean
- **THEN** a metadata issue is shown and specs are not silently skipped

### Requirement: Rename pairs are parsed in native OpenSpec syntax
The system SHALL parse FROM and TO requirement-name pairs under RENAMED Requirements without requiring an extra requirement heading.

#### Scenario: Native rename pair
- **WHEN** a rename section contains FROM and TO lines naming requirements
- **THEN** both names are extracted and no missing-scenario warning is invented for the rename
