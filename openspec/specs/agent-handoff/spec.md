# agent-handoff Specification

## Purpose
TBD - created by archiving change add-specdeck-mvp. Update Purpose after archive.
## Requirements
### Requirement: Handoff payload is harness independent
The system SHALL build one handoff payload that names the change and directs the agent
to read its own instructions from the OpenSpec CLI, and SHALL NOT embed spec content or
a reimplemented prompt template in the payload.

#### Scenario: Payload names the change
- **WHEN** a handoff is prepared for any configured harness
- **THEN** the payload identifies the change and the OpenSpec commands to run
- **AND** the payload does not contain copied spec or proposal content

### Requirement: Configured harnesses are detected from project files
The system SHALL detect which AI harnesses a project is configured for by looking for
the OpenSpec generated skill and command files, and SHALL NOT treat the presence of a
tool's directory alone as configuration.

#### Scenario: Harness is configured
- **WHEN** a project contains OpenSpec generated skill files for a harness
- **THEN** that harness is reported as configured

#### Scenario: Tool directory exists but OpenSpec is not wired in
- **WHEN** a project contains a tool's directory but no OpenSpec generated files for it
- **THEN** the harness is reported as present but not configured
- **AND** an action to configure it is offered

#### Scenario: Harness stores its commands outside the project
- **WHEN** a harness writes its command files outside the project directory
- **THEN** specdeck reports that harness as undetectable rather than reporting it absent

### Requirement: Handoff resolves to the best available method
The system SHALL attempt handoff methods in order of capability and SHALL fall back to
copying the payload, which is always available.

#### Scenario: No integration is available
- **WHEN** a project's harness has no terminal or session integration
- **THEN** the payload is offered for copying
- **AND** the interface states which method was used

#### Scenario: User restricts the method
- **WHEN** a user selects a specific handoff method in settings
- **THEN** no method above the selected one is attempted

### Requirement: Capability gaps and runtime failures are distinguished
The system SHALL fall through silently when a method is not implemented for a harness,
and SHALL report a human readable error without silently falling through when an
implemented method is attempted and fails.

#### Scenario: Method is not implemented
- **WHEN** a harness has no session integration
- **THEN** the next method is used without an error being shown

#### Scenario: Implemented method fails at runtime
- **WHEN** a session handoff is attempted and the session cannot be reached
- **THEN** the failure and its reason are shown to the user
- **AND** the lower method is offered as an explicit choice rather than used automatically

### Requirement: Session handoff never claims to send a message
The system SHALL describe session handoff as opening a session with the payload copied,
and SHALL NOT present it as injecting a message into a running conversation.

#### Scenario: Existing session is opened
- **WHEN** a user hands off to a running agent session
- **THEN** the session is opened and the payload is placed on the clipboard
- **AND** the interface does not claim the message was delivered

### Requirement: Undocumented harness integrations degrade safely
The system SHALL feature detect any integration that depends on undocumented harness
internals, and SHALL hide that integration when detection fails.

#### Scenario: Session storage format changes
- **WHEN** a harness's session storage cannot be read or parsed
- **THEN** the session handoff option is hidden
- **AND** all other handoff methods continue to work

