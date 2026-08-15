# live-updates Specification

## Purpose
TBD - created by archiving change add-specdeck-mvp. Update Purpose after archive.
## Requirements
### Requirement: Local state updates without user action
The system SHALL watch the local filesystem and SHALL push updated state to the browser
when watched files change, without the user refreshing or clicking.

#### Scenario: Agent writes a spec file
- **WHEN** an agent creates a spec file inside a change directory
- **THEN** the affected change updates in the browser without user action

#### Scenario: Task is completed outside specdeck
- **WHEN** a checkbox in a tasks file is ticked by an editor or an agent
- **THEN** the change's progress and lane update in the browser

### Requirement: Git state changes are observed
The system SHALL watch the git directory's head, index, refs, and fetch head so that
committing, switching branches, and fetching update sync state without a rescan
being triggered by something else.

#### Scenario: User commits their work
- **WHEN** a user commits changes to OpenSpec files
- **THEN** uncommitted indicators clear and ahead indicators update

#### Scenario: User switches branches
- **WHEN** a user checks out a different branch
- **THEN** the board recomputes against the new branch

### Requirement: Bursts of filesystem events never render an intermediate state
The system SHALL coalesce filesystem events over a quiet period and SHALL NOT render
state derived from a directory that is mid mutation.

#### Scenario: Change is archived
- **WHEN** an archive operation deletes a change directory and recreates it under the archive
- **THEN** the card does not appear in an earlier lane at any point
- **AND** the board transitions directly to showing the change as archived

#### Scenario: Agent writes several spec files
- **WHEN** an agent writes multiple spec files in quick succession
- **THEN** the board updates once when writing settles
- **AND** the change never appears to move backwards

### Requirement: Watcher failure is observable, not silent
The system SHALL run a periodic reconcile that recomputes state regardless of watcher
events, and SHALL display how long ago the last successful scan completed.

#### Scenario: Watcher misses an event
- **WHEN** a filesystem change occurs that the watcher does not report
- **THEN** the periodic reconcile detects the change and updates the board

#### Scenario: Scan age is visible
- **WHEN** the board is displayed
- **THEN** the time since the last successful scan is shown

### Requirement: Only the active project is watched live
The system SHALL watch the active project with live updates and SHALL refresh other
registered projects on a slower interval.

#### Scenario: Switching projects
- **WHEN** a user switches to another registered project
- **THEN** live watching moves to the newly active project

#### Scenario: Background project has activity
- **WHEN** a registered project that is not active has in progress work
- **THEN** the project switcher reflects that on its next slow refresh

