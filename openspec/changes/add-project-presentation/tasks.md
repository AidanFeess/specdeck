## 1. Capture

- [ ] 1.1 Prepare a purpose-built repository with invented contents that exercises the sync states this project cannot show, including a change that exists only on the remote
- [ ] 1.2 Capture the board against specdeck's own repository, showing lanes, task progress, and sync chips
- [ ] 1.3 Capture the change detail panel on the tasks tab, showing grouped tasks and progress
- [ ] 1.4 Capture the projects view showing several projects with their lane breakdowns
- [ ] 1.5 Record a short clip of a card updating as a file changes on disk, since that behavior cannot be conveyed in prose
- [ ] 1.6 Capture in both light and dark, and keep whichever reads better at README width

## 2. Review Before Committing

- [ ] 2.1 Inspect every captured image for anything that should not be published: tokens, private repository names, unrelated browser tabs, notifications, personal paths beyond the unavoidable
- [ ] 2.2 Crop to the application rather than the whole desktop
- [ ] 2.3 Compress the images and the recording, and record the resulting sizes
- [ ] 2.4 Confirm no third-party logo, font, or image appears in any asset

## 3. README

- [ ] 3.1 Study several well regarded open source READMEs and record which conventions are actually common rather than assumed
- [ ] 3.2 Rewrite the opening so a reader sees what it is, what it looks like, and how to run it before anything else
- [ ] 3.3 Place the screenshots and the recording where they support the claims next to them
- [ ] 3.4 Check every capability sentence against the software, and remove or mark anything not yet true
- [ ] 3.5 Remove any performance or compatibility claim that has not been measured or run
- [ ] 3.6 Confirm other tools are named descriptively only, with no logos and nothing implying endorsement
- [ ] 3.7 Keep the known limitations section honest and current

## 4. Repository Presentation

- [ ] 4.1 Set the repository description to one accurate sentence
- [ ] 4.2 Set topics so the project is findable by subject
- [ ] 4.3 Confirm the license file and the manifest agree, and that the license is stated in the README

## 5. Branch Model

- [ ] 5.1 Create a `dev` branch from `main` and make it the default branch
- [ ] 5.2 Protect `main`: require CI to pass, and confirm the rules do not block tag pushes
- [ ] 5.3 Confirm a solo maintainer can still merge and release without disabling protection
- [ ] 5.4 Exercise the release path end to end after protection is applied, rather than assuming it still works
- [ ] 5.5 Document the branch model and the release steps in the contributing guide

## 6. Verification

- [ ] 6.1 Read the rendered README on GitHub at both desktop and mobile widths
- [ ] 6.2 Confirm every image loads from a fresh clone and from the GitHub page
- [ ] 6.3 Confirm the published package still contains only the built output, the README, and the license
