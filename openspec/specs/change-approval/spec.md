# change-approval Specification

## Purpose

Recording that a change has been approved as a commit in the repository, so the approval is derived from git rather than stored by specdeck, and lapses by itself when what was approved changes.

## Requirements
### Requirement: Approving a change records a commit in the repository
The system SHALL record approval by staging the change's directory and creating a commit
carrying a trailer that names the approver, and SHALL NOT record approval anywhere else.

#### Scenario: Change is approved
- **WHEN** a user approves a change
- **THEN** the change's directory is staged and committed
- **AND** the commit message carries a trailer naming the approver and the change

#### Scenario: Nothing else is written
- **WHEN** a change is approved
- **THEN** no file outside the change's own directory is staged or committed
- **AND** no approval record is written to specdeck's configuration

### Requirement: Approval is derived from git, never stored by specdeck
The system SHALL determine a change's approval state by reading the repository's history,
and SHALL hold no approval state of its own.

#### Scenario: Repository is cloned fresh
- **WHEN** a user opens a clone of a repository containing an approved change
- **THEN** the change is shown as approved
- **AND** the approver and approval time come from the commit

#### Scenario: Teammate approved a change
- **WHEN** a teammate's approval commit arrives through a pull
- **THEN** the change is shown as approved without any further action

### Requirement: Approval lapses when the approved artifacts change
The system SHALL show a change as needing review when any artifact under it differs from its
state at the approving commit, whether the difference is committed or uncommitted.

#### Scenario: Artifact is edited after approval
- **WHEN** an artifact of an approved change is modified
- **THEN** the change is shown as needing review
- **AND** which artifacts differ is shown

#### Scenario: Modification is reverted
- **WHEN** the artifacts of an approved change are restored to their approved content
- **THEN** the change is shown as approved again

#### Scenario: Change is approved again after edits
- **WHEN** a user approves a change that had lapsed
- **THEN** a new approval commit is recorded
- **AND** the earlier approval remains in history

### Requirement: Approval requires a repository and an identity
The system SHALL refuse to approve when the project is not a git repository or when git has
no configured user identity, and SHALL explain which condition failed.

#### Scenario: Project is not a repository
- **WHEN** a user attempts to approve in a project with no repository
- **THEN** approval is refused
- **AND** the reason states that approval is recorded as a commit

#### Scenario: Git has no identity configured
- **WHEN** a user attempts to approve and git has no user name or email set
- **THEN** approval is refused
- **AND** the commands that would configure an identity are shown

#### Scenario: Approval state cannot be determined
- **WHEN** approval state cannot be read for a change
- **THEN** no approval state is shown for it rather than an unapproved state
- **AND** the reason is available

### Requirement: Approval is confirmed against what is being approved
The system SHALL show what the approval will cover before it is recorded.

#### Scenario: Approval is requested
- **WHEN** a user begins approving a change
- **THEN** the artifacts to be committed are listed
- **AND** any files in the change directory that are uncommitted are shown, because approving
  commits them

#### Scenario: Change has validation failures
- **WHEN** a user approves a change that fails OpenSpec validation
- **THEN** the failures are shown before the approval is confirmed
- **AND** the user may still approve, because validity and agreement are different questions

### Requirement: Approval appears in the change's timeline
The system SHALL include approval events in the timeline reconstructed for a change.

#### Scenario: Timeline is opened for an approved change
- **WHEN** a user opens the timeline of a change that has been approved
- **THEN** each approval appears with its time and approver
- **AND** approvals are ordered with the other events in the timeline

