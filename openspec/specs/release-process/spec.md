# release-process Specification

## Purpose

What must be true before code can be released, what the published package may contain, and what published material may not carry.

## Requirements
### Requirement: Released code passes verification before it can reach the release branch
The system SHALL protect the branch that releases are cut from, and SHALL require the
verification suite to pass before changes land on it.

#### Scenario: A change that fails verification
- **WHEN** a change failing the verification suite is proposed to the release branch
- **THEN** it cannot be merged

#### Scenario: Cutting a release after protection is applied
- **WHEN** a release tag is pushed
- **THEN** the release workflow still runs to completion
- **AND** no protection rule has to be disabled to publish

#### Scenario: A single maintainer
- **WHEN** the only maintainer needs to merge their own work
- **THEN** the protection rules permit it without being switched off

### Requirement: The published package contains only what it needs to run
The system SHALL publish the built output, the readme, and the license, and SHALL NOT
publish sources, tests, development configuration, or documentation media.

#### Scenario: Inspecting a published version
- **WHEN** a published version is unpacked
- **THEN** it contains the built output, the readme, and the license
- **AND** it contains no test files, no source directory, and no image assets

#### Scenario: Documentation media is added to the repository
- **WHEN** image or video assets are committed for the readme
- **THEN** the size of the published package is unchanged

### Requirement: Published material carries no credentials or private information
The system SHALL ensure that material published to the repository carries no access
tokens, no credentials, and no private repository or path information beyond what the
project already exposes.

#### Scenario: Adding a captured screenshot
- **WHEN** a screenshot is prepared for publication
- **THEN** it is inspected for tokens, credentials, unrelated applications, and private
  names before being committed

#### Scenario: A capture would expose something private
- **WHEN** a capture contains information that should not be published
- **THEN** it is recaptured or cropped rather than committed and removed afterwards

### Requirement: Documented claims match observed behavior
The system SHALL state in its documentation only what the software does, and SHALL mark
anything not yet implemented as not yet implemented.

#### Scenario: A capability is described
- **WHEN** the documentation claims a capability
- **THEN** that capability has been exercised against the software as released

#### Scenario: A capability is planned but absent
- **WHEN** a capability is designed but not built
- **THEN** the documentation says so rather than implying it works

#### Scenario: A claim goes stale
- **WHEN** behavior changes such that a documented claim is no longer true
- **THEN** the claim is corrected as part of the change that made it stale

