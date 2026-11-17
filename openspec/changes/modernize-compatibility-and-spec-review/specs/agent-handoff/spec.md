## MODIFIED Requirements

### Requirement: Configured harnesses are detected from project files
The system SHALL detect OpenSpec workflows from legacy commands, tool-specific skills, shared project skills, and known local global skill roots. It SHALL identify the installation source and SHALL NOT infer an installed agent from a shared skill or tool directory alone.

#### Scenario: Harness is configured
- **WHEN** a project contains OpenSpec generated skill files for a harness
- **THEN** that harness is reported as configured

#### Scenario: Tool directory exists but OpenSpec is not wired in
- **WHEN** a project contains a tool's directory but no OpenSpec generated files for it
- **THEN** the harness is reported as present but not configured
- **AND** an action to configure it is offered

#### Scenario: Shared or global skill is available
- **WHEN** a known shared or global root contains an OpenSpec skill
- **THEN** the workflow is offered with its source identified without claiming every agent is installed

#### Scenario: Harness stores its commands outside the project
- **WHEN** a harness writes its command files outside inspected roots
- **THEN** specdeck reports its setup as undetectable rather than absent

## ADDED Requirements

### Requirement: Handoff uses an exact available workflow
The system SHALL select an exact legacy command or matching skill for the requested workflow and SHALL retain a plain-text fallback when it is unavailable.

#### Scenario: Modern skill replaces command
- **WHEN** apply is requested and openspec-apply-change is available
- **THEN** handoff names that skill using the supported tool invocation or a plain-language skill instruction

#### Scenario: Similar workflow name
- **WHEN** only bulk-archive is available and archive is requested
- **THEN** bulk-archive is not selected
