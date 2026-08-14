## ADDED Requirements

### Requirement: Sync state is computed before it is displayed
The system SHALL run capability guards before comparing against a remote, and SHALL
suppress all sync indicators when a comparison cannot be performed rather than
presenting the result as in sync.

#### Scenario: Directory is not a git repository
- **WHEN** a registered project is not inside a git repository
- **THEN** no sync indicators are shown on any card
- **AND** the board reports that sync is unavailable and why

#### Scenario: Repository has no commits
- **WHEN** a repository has a remote configured but no commits yet
- **THEN** no ahead or behind indicators are shown
- **AND** uncommitted work is still reported

#### Scenario: Remote ref cannot be resolved
- **WHEN** no upstream, origin head, or origin default branch can be resolved
- **THEN** sync indicators are suppressed board wide
- **AND** the reason is reported in the board level sync summary

### Requirement: Modification detection is immune to line ending normalization
The system SHALL detect modified files using a git command that applies the clean
filter, and SHALL NOT use porcelain status output for modification detection.

#### Scenario: Repository uses automatic line ending conversion
- **WHEN** a repository is checked out with automatic CRLF conversion enabled
- **AND** an agent writes a spec file using LF line endings
- **THEN** the file is not reported as modified unless its content actually changed

### Requirement: Sync state distinguishes local liveness from remote staleness
The system SHALL present uncommitted state as live and remote comparison as a snapshot,
and SHALL always display how old the remote snapshot is.

#### Scenario: Remote snapshot age is visible
- **WHEN** the board displays any ahead or behind indicator
- **THEN** the age of the last successful fetch is displayed
- **AND** the display distinguishes never fetched from fetched at a known time

### Requirement: Remote refresh never blocks the interface
The system SHALL fetch remote refs on a background interval and on explicit user
request, SHALL disable terminal prompting on every fetch, and SHALL NOT fetch as part
of rendering.

#### Scenario: Remote requires credentials
- **WHEN** a fetch would require interactive credential entry
- **THEN** the fetch fails immediately rather than waiting for input
- **AND** the board reports that the remote could not be reached

#### Scenario: Teammate pushes a change
- **WHEN** a collaborator pushes a change that does not exist locally
- **AND** a background or manual fetch succeeds
- **THEN** the change appears as present on the remote only
- **AND** an action to retrieve it is offered

### Requirement: Sync computation tolerates non standard repository layouts
The system SHALL resolve the git directory rather than assuming a literal `.git`
directory, SHALL exclude submodule entries from file inventories, and SHALL treat
git's recorded path spelling as canonical.

#### Scenario: Project is a linked worktree
- **WHEN** a project is opened from a linked git worktree
- **THEN** fetch age and repository state resolve for that worktree

#### Scenario: Inventory encounters a submodule
- **WHEN** a tree listing includes a submodule entry
- **THEN** the entry is excluded from the file inventory
