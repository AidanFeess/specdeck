# artifact-review Specification

## Purpose

Reading every artifact a change has, and the specs it has accumulated, in the dashboard rather than in an editor, and editing one deliberately without ever writing over work that moved underneath.

## Requirements
### Requirement: Every artifact a schema declares is readable in the dashboard
The system SHALL render each artifact declared by a change's workflow schema as formatted
markdown, and SHALL derive the set of readable artifacts from the schema rather than from a
fixed list of filenames.

#### Scenario: Change uses the default schema
- **WHEN** a user opens a change whose schema declares proposal, specs, design, and tasks
- **THEN** each of those artifacts is readable in the detail view
- **AND** each is rendered as formatted markdown rather than raw source

#### Scenario: Change uses a schema with different artifacts
- **WHEN** a user opens a change whose schema declares an artifact specdeck has no special
  handling for
- **THEN** that artifact is readable alongside the others
- **AND** no artifact is hidden merely because it is unrecognized

#### Scenario: Declared artifact does not exist yet
- **WHEN** a schema declares an artifact the change has not produced
- **THEN** the artifact is listed in the state the schema reports for it
- **AND** the reason it is blocked is shown when it depends on a missing artifact

### Requirement: Accumulated specs are readable in the same reader
The system SHALL render capability specs under the project's main specs directory using the
same reader used for change artifacts.

#### Scenario: Capability is opened from the specs view
- **WHEN** a user opens a capability from the specs view
- **THEN** its full spec file is rendered as formatted markdown
- **AND** its requirements and scenarios remain individually addressable

### Requirement: The rendered source is always reachable
The system SHALL provide the raw markdown of any rendered artifact without leaving the
dashboard.

#### Scenario: User wants the source
- **WHEN** a user switches a rendered artifact to its source
- **THEN** the file's exact bytes are shown, unformatted
- **AND** switching back restores the rendered view

### Requirement: Editing is entered deliberately
The system SHALL render artifacts read-only by default and SHALL require an explicit action
to begin editing.

#### Scenario: Artifact is opened
- **WHEN** a user opens any artifact
- **THEN** it is not editable until editing is entered explicitly

#### Scenario: Editing is abandoned
- **WHEN** a user leaves an edit with unsaved text
- **THEN** the user is warned before the text is discarded

### Requirement: Writes are refused rather than merged when the file moved underneath
The system SHALL verify that an artifact's content on disk still matches what was loaded
before writing it, and SHALL refuse the write when it does not.

#### Scenario: Agent rewrote the file during an edit
- **WHEN** a user saves an artifact that changed on disk after it was loaded
- **THEN** the write is refused
- **AND** the user is told the file changed and the edit is preserved

#### Scenario: File is unchanged
- **WHEN** a user saves an artifact that has not changed on disk since it was loaded
- **THEN** the file is written
- **AND** the board reflects the new content without a manual refresh

### Requirement: Writes stay inside the open project
The system SHALL reject any artifact write whose resolved path lies outside the project
currently open.

#### Scenario: Path escapes the project
- **WHEN** a write is requested for a path outside the open project
- **THEN** the write is refused
- **AND** nothing is written anywhere

### Requirement: Validation runs on save and is attached to the file it concerns
The system SHALL run OpenSpec validation for a change after an artifact of that change is
saved, and SHALL present the findings against that change rather than as a global message.

#### Scenario: Saved artifact validates
- **WHEN** an artifact is saved and validation reports no issues
- **THEN** the change is shown as valid
- **AND** any previous findings for it are cleared

#### Scenario: Saved artifact fails validation
- **WHEN** an artifact is saved and validation reports issues
- **THEN** each issue is shown with its message against the change
- **AND** the file remains saved, because refusing to persist text the user wrote would lose
  work

#### Scenario: Validation cannot run
- **WHEN** validation cannot be run at all
- **THEN** the change is shown as unvalidated rather than as valid
- **AND** the reason is stated

