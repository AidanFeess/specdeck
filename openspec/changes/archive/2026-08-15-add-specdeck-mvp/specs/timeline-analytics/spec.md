## ADDED Requirements

### Requirement: Change history is derived from git rather than file timestamps
The system SHALL derive a change's first worked and last worked times from git history
when git history is available, and SHALL fall back to recorded metadata and file
modification times when it is not.

#### Scenario: Repository has history for the change
- **WHEN** a change has commits touching its directory
- **THEN** its first worked time comes from the earliest such commit
- **AND** its last worked time comes from the most recent such commit

#### Scenario: Repository has no history for the change
- **WHEN** a change has no commits touching its directory
- **THEN** the recorded creation date and file modification times are used
- **AND** the interface states that the times are approximate

#### Scenario: Project is not a git repository
- **WHEN** a project is not inside a git repository
- **THEN** timeline data falls back to file modification times
- **AND** the reduced accuracy is stated

### Requirement: Per artifact timing is available
The system SHALL report when each artifact of a change was first written and last
changed.

#### Scenario: Artifact timings are shown
- **WHEN** a user opens a change's timeline
- **THEN** each artifact's first written and last changed times are listed

### Requirement: Task completion history is reconstructed
The system SHALL reconstruct when individual tasks were completed by examining the
history of the change's tasks file.

#### Scenario: Task completion over time is shown
- **WHEN** a change's tasks file has history with checkboxes ticked across commits
- **THEN** the times at which tasks were completed are reported

#### Scenario: History reconstruction is expensive
- **WHEN** task history is reconstructed for a change
- **THEN** the result is cached against the commit it was computed from
- **AND** the cached result is reused until that commit changes

### Requirement: Analytics never block the interface
The system SHALL compute history derived analytics without delaying the board, and
SHALL indicate when analytics are still being computed.

#### Scenario: History is still loading
- **WHEN** the board renders before history analysis has completed
- **THEN** the board is fully usable
- **AND** timeline values indicate that they are still being computed

### Requirement: Archived changes contribute to project level figures
The system SHALL include archived changes when reporting project level figures such as
time from first work to archive.

#### Scenario: Archived change is included
- **WHEN** a project has archived changes
- **THEN** project level figures account for them
- **AND** each archived change's elapsed time is reported
