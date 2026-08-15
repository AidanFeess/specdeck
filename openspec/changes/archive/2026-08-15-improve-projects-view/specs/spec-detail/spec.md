## ADDED Requirements

### Requirement: Opening a document asks which application to use
The system SHALL ask the user which application to open a document with, rather than
inferring one, and SHALL offer the editors it can find on the machine.

#### Scenario: Opening a document for the first time
- **WHEN** a user opens a document and no preference is stored
- **THEN** they are asked which application to use
- **AND** the editors found on the machine are offered as choices

#### Scenario: No editor can be found
- **WHEN** no known editor is detected
- **THEN** the user can still name a command or a path
- **AND** the system default remains available as a choice

#### Scenario: The system default is chosen
- **WHEN** a user chooses to use the system default
- **THEN** the document is handed to the operating system as before

#### Scenario: The operating system has no handler
- **WHEN** the system default is used and the operating system cannot open the file type
- **THEN** the failure is reported rather than appearing to do nothing

### Requirement: A choice can be remembered
The system SHALL remember the chosen application only when the user asks it to, and
SHALL state which application it will use next time.

#### Scenario: Remembering a choice
- **WHEN** a user chooses an application and asks for it to be remembered
- **THEN** later opens use that application without asking again

#### Scenario: Declining to remember
- **WHEN** a user chooses an application without asking for it to be remembered
- **THEN** the next open asks again

#### Scenario: A remembered application can no longer be launched
- **WHEN** a remembered application is missing or fails to start
- **THEN** the failure is reported with what was attempted
- **AND** the user is asked to choose again rather than left with a silent failure

### Requirement: Preferences can be changed without repeating the action that set them
The system SHALL provide a settings view where the remembered editor and the handoff
method can be changed or cleared.

#### Scenario: Changing the remembered editor
- **WHEN** a user opens settings
- **THEN** the remembered editor is shown and can be changed or cleared

#### Scenario: Clearing the remembered editor
- **WHEN** a user clears the remembered editor
- **THEN** the next open asks again

#### Scenario: Changing the handoff method
- **WHEN** a user opens settings
- **THEN** the handoff method can be changed there, not only from the handoff sheet
