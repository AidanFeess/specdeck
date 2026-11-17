## ADDED Requirements

### Requirement: Review compares proposed behavior with current specs
The system SHALL show current and proposed requirement text and scenarios for each delta operation, including added, modified, removed, and renamed requirements.

#### Scenario: Requirement changes its scenarios
- **WHEN** a modified requirement adds, changes, or removes a named scenario
- **THEN** the review labels each scenario change and shows its before and after content

#### Scenario: Requirement is renamed
- **WHEN** a delta renames an existing requirement
- **THEN** the review preserves its body and scenarios unless a modification explicitly replaces them

### Requirement: Resulting capability previews are conservative
The system SHALL preview resulting requirements without writing files and SHALL withhold a preview whose delta cannot be applied unambiguously.

#### Scenario: Valid delta
- **WHEN** all operations resolve against unique current requirements
- **THEN** a resulting capability preview includes unchanged and changed requirements

#### Scenario: Missing or duplicate target
- **WHEN** an operation targets an absent requirement or names are ambiguous
- **THEN** the review explains the issue and does not present a successful resulting preview

#### Scenario: Archived change
- **WHEN** a user reviews an archived change
- **THEN** the interface explains that current specs are not a reliable historical baseline

### Requirement: Approval comparisons use git evidence
The system SHALL show current and approved artifact contents using the latest approval commit and SHALL distinguish unavailable history from no approval.

#### Scenario: Artifact changes after approval
- **WHEN** an artifact is edited, added, or deleted after approval
- **THEN** the review shows the approved and current versions with the approval commit identified

#### Scenario: Comparison cannot be read
- **WHEN** git history or artifact content cannot be read
- **THEN** the review reports the failure instead of showing an empty successful comparison
