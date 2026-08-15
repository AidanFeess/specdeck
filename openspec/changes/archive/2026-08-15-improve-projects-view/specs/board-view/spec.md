## ADDED Requirements

### Requirement: Projects can be arranged deliberately
The system SHALL allow a user to rearrange projects on the projects view, and SHALL
apply that arrangement whenever the manual order is in effect.

#### Scenario: Dragging a project to a new position
- **WHEN** a user drags a project card to another position
- **THEN** the list reflects the new arrangement
- **AND** the arrangement survives restarting specdeck

#### Scenario: Rearranging without a pointer
- **WHEN** a user focuses a project card by keyboard
- **THEN** controls to move it earlier or later are available and operable

#### Scenario: A rescan arrives mid drag
- **WHEN** the projects view is re-rendered while a card is being dragged
- **THEN** the drag is not interrupted

### Requirement: Starred projects stay at the top
The system SHALL place starred projects above every unstarred project, and SHALL NOT
reorder starred projects when a sort is applied.

#### Scenario: Sorting with starred projects present
- **WHEN** a sort is applied
- **THEN** starred projects remain above the unstarred ones
- **AND** the order of the starred projects is unchanged

#### Scenario: Unstarring a project
- **WHEN** a user unstars a project
- **THEN** it moves into the unstarred group and is subject to the current sort

### Requirement: Projects can be sorted
The system SHALL offer sorting by name, by most recent activity, and by outstanding task
count, in addition to the manual arrangement.

#### Scenario: Sorting by name
- **WHEN** the user sorts by name
- **THEN** unstarred projects are ordered alphabetically

#### Scenario: Sorting by most recent activity
- **WHEN** the user sorts by activity
- **THEN** unstarred projects are ordered with the most recently worked first
- **AND** projects with no known activity sort last rather than first

#### Scenario: Sorting by outstanding work
- **WHEN** the user sorts by outstanding tasks
- **THEN** unstarred projects are ordered by how many tasks remain

#### Scenario: A sort is chosen
- **WHEN** any sort other than the manual arrangement is active
- **THEN** dragging is unavailable, so the arrangement cannot be ambiguous
- **AND** returning to the manual arrangement restores the stored order

#### Scenario: The chosen sort persists
- **WHEN** a user selects a sort and reopens specdeck
- **THEN** the same sort is still selected

### Requirement: The filter applies to the view being shown
The system SHALL filter projects by name on the projects view, and SHALL clear the
filter when the user switches to another view.

#### Scenario: Filtering projects
- **WHEN** a user types into the filter on the projects view
- **THEN** only projects whose name matches remain visible

#### Scenario: Nothing matches
- **WHEN** no project matches the filter
- **THEN** the view says so rather than appearing empty

#### Scenario: Leaving the view
- **WHEN** the user switches to the board or the specs view
- **THEN** the filter is cleared

### Requirement: Header chrome suits the view being shown
The system SHALL show a summary chip only on views where it has a meaning, and SHALL
hide it rather than render it empty.

#### Scenario: Projects view
- **WHEN** the projects view is shown
- **THEN** no empty summary chip is rendered

#### Scenario: Board and specs views
- **WHEN** the board or the specs view is shown
- **THEN** the summary chip is shown with its counts

#### Scenario: Scan age
- **WHEN** any view is shown
- **THEN** the age of the last scan remains visible

### Requirement: The product name returns to the projects view
The system SHALL make the product name in the header a way back to the projects view.

#### Scenario: Clicking the product name
- **WHEN** a user clicks the product name in the header
- **THEN** the projects view is shown

#### Scenario: Reaching it without a pointer
- **WHEN** a user navigates the header by keyboard
- **THEN** the product name can be focused and activated
