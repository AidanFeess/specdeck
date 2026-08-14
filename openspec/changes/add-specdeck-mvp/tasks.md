## 1. Project Foundation

- [x] 1.1 Set up the repository: package manifest, TypeScript configuration, linting, formatting, and editor config
- [x] 1.2 Add the test runner and a first passing test so the harness is proven before features land
- [x] 1.3 Add continuous integration running build, lint, and tests on Windows, macOS, and Linux
- [x] 1.4 Pin `@fission-ai/openspec` as a dependency and add a version compatibility check with a clear message when the installed version is newer than supported
- [x] 1.5 Write the README covering what specdeck is, how to run it, and how to contribute
- [x] 1.6 Add the license, contribution guide, and issue templates
- [x] 1.7 Configure release automation producing tagged GitHub releases and publishing to npm

## 2. Spike: Watcher Reliability

- [x] 2.1 Measure filesystem watcher latency and event loss for local paths, cross filesystem paths, network mounts, and editors that save by rename
- [x] 2.2 Measure the event burst produced by an archive operation and by an agent writing several spec files
- [x] 2.3 Choose the watcher library and the coalescing quiet period from the measurements, and record the results in the design

## 3. Read Model and Parsing

- [x] 3.1 Define the read model types for projects, changes, artifacts, capabilities, requirements, scenarios, and tasks
- [x] 3.2 Implement the file access interface that all reads route through, so future sources can be added behind it
- [x] 3.3 Parse change metadata and resolve each change's schema and expected artifacts
- [x] 3.4 Parse proposal, design, and task artifacts, including checkbox extraction with completed and total counts
- [x] 3.5 Parse main capability specs into requirements and scenarios
- [x] 3.6 Parse delta specs, attributing each requirement to its added, modified, removed, or renamed operation
- [x] 3.7 Detect malformed scenario headings and surface them as a parse warning rather than silently reporting zero scenarios
- [x] 3.8 Derive lane state from artifact existence, task ratio, and archive location
- [x] 3.9 Contain parse failures to the affected item so one malformed change cannot blank the board
- [x] 3.10 Build a fixture corpus covering empty changes, partial artifacts, malformed markdown, archived changes, and unicode paths, and test parsing against it

## 4. Project Registry and Settings

- [x] 4.1 Implement the configuration store in specdeck's own directory, with schema validation and safe handling of a corrupt or missing file
- [x] 4.2 Implement project registration, listing, and removal
- [x] 4.3 Resolve each project's planning home using the OpenSpec exported resolvers, handling the unresolved case
- [x] 4.4 Implement settings resolution from project override to global default to built in default
- [x] 4.5 Assert in tests that registering and using a project writes no file into the project directory

## 5. Server and Interface Shell

- [x] 5.1 Implement the command line entry point that starts the server, picks a free port, and opens the browser
- [x] 5.2 Bind to the loopback interface only and reject cross origin requests
- [x] 5.3 Implement the read endpoints serving project, change, and capability state
- [x] 5.4 Implement the server sent events channel that pushes state updates to the browser
- [x] 5.5 Build the interface shell with the project switcher and navigation
- [x] 5.6 Implement the empty state shown when no projects are registered

## 6. Git Sync

- [x] 6.1 Implement git invocation as a subprocess using an argument array, never a shell string, with paths handled correctly on Windows
- [x] 6.2 Implement the capability guards for not a repository, no commits, and no resolvable remote reference
- [x] 6.3 Resolve the remote reference by upstream, then origin head, then origin default branch
- [x] 6.4 Implement the file inventory from the tree listing, excluding submodule entries and treating git's path spelling as canonical
- [x] 6.5 Implement uncommitted detection using diff against head rather than porcelain status, and test it under automatic line ending conversion
- [x] 6.6 Implement ahead and behind computation against the resolved remote reference
- [x] 6.7 Roll per artifact sync state up to per change counts
- [x] 6.8 Implement fetch age reporting, resolving the git directory rather than assuming a literal path, and handle the never fetched case
- [x] 6.9 Implement background and manual fetch with terminal prompting disabled, reporting unreachable remotes
- [x] 6.10 Test against fixtures covering no remote, no commits, detached head, no upstream, linked worktrees, submodules, and shallow clones

## 7. Live Updates

- [x] 7.1 Watch the OpenSpec directory tree for the active project
- [x] 7.2 Watch the git head, index, references, and fetch head so commits, branch switches, and fetches update sync state
- [x] 7.3 Implement event coalescing using the quiet period chosen in the spike
- [x] 7.4 Verify that archiving never renders the change in an earlier lane at any point
- [x] 7.5 Implement the periodic reconcile backstop that recomputes state regardless of watcher events
- [x] 7.6 Display the age of the last successful scan
- [x] 7.7 Implement slow interval refresh for registered projects that are not active
- [x] 7.8 Handle watcher startup failure by falling back to polling and stating that live updates are unavailable

## 8. Board View

- [x] 8.1 Render lanes and cards from derived state, with task counts and progress
- [x] 8.2 Render the primary action on each card, labelled from the next step OpenSpec reports
- [x] 8.3 Make cards and their actions reachable and operable by keyboard
- [x] 8.4 Render counted sync indicators, rendering nothing when a change is fully in sync
- [x] 8.5 Render the board level sync summary including remote snapshot age and any suppression reason
- [x] 8.6 Render remote only changes distinctly, with an action to retrieve them
- [x] 8.7 Implement the per artifact sync detail shown on hover and on keyboard focus, with text labels
- [x] 8.8 Implement drag to archive with a confirmation showing incomplete task counts and validation results
- [x] 8.9 Reject drags between derived lanes and explain why on the first attempt
- [x] 8.10 Report archive command failures with their output and reconcile the board to actual disk state
- [x] 8.11 Verify that no sync state is conveyed by color alone

## 9. Detail Views

- [x] 9.1 Implement the change detail view listing artifacts, their status, and their dependencies
- [x] 9.2 Implement the capability detail view listing requirements and scenarios
- [x] 9.3 Implement bidirectional linking between changes and capabilities, including capabilities that do not exist yet
- [x] 9.4 Render delta operations per requirement, including reason and migration for removals
- [x] 9.5 Render artifact content with sanitized markdown so spec content cannot execute script
- [x] 9.6 Implement opening the underlying file in the user's editor
- [x] 9.7 Implement search and filtering across changes, capabilities, and requirements

## 10. Timeline and Analytics

- [x] 10.1 Derive first worked and last worked times per change from git history
- [x] 10.2 Fall back to recorded metadata and file modification times when history is unavailable, and state the reduced accuracy
- [x] 10.3 Derive per artifact first written and last changed times
- [x] 10.4 Reconstruct task completion times from the history of the tasks file
- [x] 10.5 Cache history derived results against the commit they were computed from and invalidate when it changes
- [x] 10.6 Compute analytics off the render path and indicate when values are still being computed
- [x] 10.7 Include archived changes in project level figures

## 11. Agent Handoff

- [x] 11.1 Build the handoff payload naming the change and the OpenSpec commands, with no embedded spec content
- [x] 11.2 Implement harness detection from OpenSpec generated skill and command files, rejecting bare directory presence as a signal
- [ ] 11.3 Report harnesses that store commands outside the project as undetectable rather than absent
- [x] 11.4 Detect a harness that is present but not wired to OpenSpec, and offer to configure it
- [x] 11.5 Implement the copy method, including the rendered payload view, and treat it as the primary path
- [x] 11.6 Implement the terminal method for harnesses with a usable non interactive entry point
- [x] 11.7 Implement session discovery and open behind feature detection, hiding the option when detection fails
- [x] 11.8 Implement method resolution with silent fall through on capability gaps and reported errors on runtime failures
- [x] 11.9 Display which method was used and why on every handoff, including successful ones
- [x] 11.10 Implement the handoff method setting at global and per project scope
- [x] 11.11 Show dispatch state in place on the card, including the file being waited for, cleared only by the user
- [x] 11.12 Add continuous integration that initializes every supported tool in a temporary directory and detects drift in the command path table

## 12. Project Initialization

- [x] 12.1 Detect directories that have no OpenSpec structure and show the initialization view
- [x] 12.2 Build the tool picker from the OpenSpec tool registry, with a fallback table if the registry export is unavailable
- [x] 12.3 Preselect tools already detected in the directory, reusing harness detection
- [x] 12.4 Disclose tools that write outside the project directory and require confirmation before running
- [x] 12.5 Display the exact command alongside the action, and make it copyable
- [x] 12.6 Run initialization and load the board for the newly initialized project
- [x] 12.7 Report initialization failures with command, exit status, and output, leaving the copyable command available
- [x] 12.8 Assert in tests that no command mutating global OpenSpec configuration is invoked during scan, refresh, or project open

## 13. Release

- [x] 13.1 Verify the packaged artifact runs from a clean install on Windows, macOS, and Linux
- [x] 13.2 Verify the interface against this repository's own OpenSpec state as the dogfooding fixture
- [x] 13.3 Complete the README with screenshots, supported harnesses, and known limitations
- [ ] 13.4 Publish the first tagged release
