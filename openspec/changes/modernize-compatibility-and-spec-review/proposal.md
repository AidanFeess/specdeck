## Why

SpecDeck needs to recognize current OpenSpec skill installations and help reviewers understand behavior changes without comparing separate documents manually.

## What Changes

- Verify and bundle OpenSpec 2.1 while retaining detection of legacy commands.
- Detect project and local global skills with explicit installation evidence and appropriate handoff invocations.
- Respect intentionally skipped specs in change metadata.
- Add a read-only spec review with current and proposed requirements, scenario changes, resulting capability previews, and artifact differences since approval.
- Report ambiguous or unavailable comparisons instead of presenting them as successful previews.

## Capabilities

### New Capabilities

- `spec-review`: Compare proposed requirements and scenarios with current specs and inspect changes since approval.

### Modified Capabilities

- `agent-handoff`: Recognize shared and global skills as well as legacy tool commands.
- `store-federation`: Read current stores and worksets and explain retired initiative linking.
- `openspec-model`: Recognize explicit spec skipping and current delta rename syntax.

## Impact

OpenSpec dependency, harness detection and drift checks, metadata and delta parsing, read-only review API, change detail UI, tests, and README. No model calls, persisted review state, automatic upgrades of managed projects, or new repository sidecar files.
