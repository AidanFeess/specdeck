## ADDED Requirements

### Requirement: Every OpenSpec command runs through one runner
The system SHALL invoke the bundled OpenSpec CLI through a single runner, and SHALL NOT
spawn the CLI from any other call site.

#### Scenario: An action invokes OpenSpec
- **WHEN** any dashboard action needs OpenSpec
- **THEN** the bundled CLI is invoked through the shared runner
- **AND** the command runs with the open project as its working directory

#### Scenario: Bundled OpenSpec is missing
- **WHEN** the bundled copy of OpenSpec cannot be located
- **THEN** the action fails without spawning anything
- **AND** the exact command the user could run by hand is shown

### Requirement: Commands never wait for input
The system SHALL pass the flags that make each OpenSpec command non-interactive, and SHALL
enforce a time limit after which a command is terminated and reported.

#### Scenario: Command would prompt
- **WHEN** an action runs a command that prompts by default
- **THEN** the command is invoked with the flags that suppress prompting

#### Scenario: Command does not finish
- **WHEN** a command has not exited within the time limit
- **THEN** it is terminated
- **AND** the timeout is reported as the reason rather than a generic failure

### Requirement: Failures report the command, the exit status, and the real output
The system SHALL present the invoked command, its exit status, and its unmodified output
when a command fails, and SHALL NOT substitute a summary for that output.

#### Scenario: Command exits with a failure
- **WHEN** an OpenSpec command exits non-zero
- **THEN** the command as invoked is shown
- **AND** the exit status is shown
- **AND** the command's own output is shown unmodified

#### Scenario: Failure is recoverable by hand
- **WHEN** a command fails
- **THEN** the shown command can be copied and run in a terminal to reproduce the failure

### Requirement: The dashboard offers the OpenSpec commands that operate on a change
The system SHALL expose creating a change, validating, updating instruction files, linking a
change to an initiative, and archiving, each as an action that runs the corresponding
OpenSpec command.

#### Scenario: New change is created
- **WHEN** a user creates a change from the dashboard and names it
- **THEN** the change is created by OpenSpec's own command
- **AND** the new change appears on the board without a manual refresh

#### Scenario: Change is validated on demand
- **WHEN** a user validates a change
- **THEN** validation runs and its findings are shown against that change

#### Scenario: Instruction files are updated
- **WHEN** a user updates a project's OpenSpec instruction files
- **THEN** the update command runs
- **AND** the files it changed are reported

#### Scenario: Action is unavailable for a change
- **WHEN** an action cannot apply to a change in its current state
- **THEN** the action is shown as unavailable with the reason
- **AND** it is not offered as though it would succeed

### Requirement: Actions are confined to the open project
The system SHALL run every OpenSpec command against the project currently open, and SHALL
refuse any action naming a target outside it.

#### Scenario: Target lies outside the open project
- **WHEN** an action names a change or path outside the open project
- **THEN** the action is refused
- **AND** no command is spawned
