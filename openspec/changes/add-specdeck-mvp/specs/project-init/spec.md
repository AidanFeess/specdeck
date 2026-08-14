## ADDED Requirements

### Requirement: Folders without OpenSpec can be initialized from the interface
The system SHALL detect that a directory has no OpenSpec structure and SHALL offer to
initialize it, both as a direct action and as a command the user can copy and run.

#### Scenario: Directory has no OpenSpec
- **WHEN** a user opens a directory that has no OpenSpec structure
- **THEN** an initialization view is shown instead of an empty board
- **AND** both a direct action and a copyable command are offered

#### Scenario: Initialization succeeds
- **WHEN** a user initializes a directory
- **THEN** the board loads for the newly initialized project

### Requirement: Tool selection is preselected from detected harnesses
The system SHALL present the OpenSpec supported tool list for selection and SHALL
preselect tools that are already detected in the directory.

#### Scenario: Project already uses a harness
- **WHEN** a directory contains a harness's own configuration directory
- **THEN** that harness is preselected in the tool picker

### Requirement: Initialization discloses effects outside the project
The system SHALL disclose, before initialization runs, any selected tool that writes
files outside the project directory, and SHALL disclose that generated output depends
on the user's global OpenSpec configuration.

#### Scenario: Tool writes outside the project
- **WHEN** a selected tool writes its command files to the user's home directory
- **THEN** that effect is stated in the interface next to the tool
- **AND** initialization does not proceed until the user confirms

#### Scenario: Command is shown alongside the action
- **WHEN** the initialization view is displayed
- **THEN** the exact command specdeck would run is shown

### Requirement: Initialization never mutates global OpenSpec configuration implicitly
The system SHALL NOT run OpenSpec commands that modify the user's global configuration
as a side effect of scanning, refreshing, or opening a project.

#### Scenario: Project is scanned
- **WHEN** specdeck scans or refreshes a project
- **THEN** no OpenSpec command that writes global configuration is invoked

### Requirement: Initialization failure leaves a usable interface
The system SHALL report initialization failures with the command that failed and its
output, and SHALL leave the interface usable.

#### Scenario: Initialization fails
- **WHEN** an initialization command exits with a failure
- **THEN** the command, exit status, and output are shown
- **AND** the copyable command remains available so the user can run it manually
