/**
 * Builds the projects the screenshots are taken against.
 *
 * Screenshots need states this repository does not have: a change in every
 * lane, work a teammate pushed that you do not have yet, uncommitted edits. The
 * alternative is capturing somebody's real work, which is how a private
 * repository name or a customer's path ends up in a README forever.
 *
 * Everything here is invented. The product does not exist.
 *
 *   node scripts/capture/demo.mjs <root>
 *
 * The root is removed and rebuilt, so the captures are reproducible rather than
 * a one-time arrangement nobody can recreate after the interface changes.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'demo');

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

function write(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${body.trimStart()}\n`, 'utf8');
}

function commit(cwd, message, when) {
  git(cwd, 'add', '-A');
  execFileSync('git', ['commit', '-m', message], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Dana Okafor',
      GIT_AUTHOR_EMAIL: 'dana@example.com',
      GIT_COMMITTER_NAME: 'Dana Okafor',
      GIT_COMMITTER_EMAIL: 'dana@example.com',
      GIT_AUTHOR_DATE: when,
      GIT_COMMITTER_DATE: when,
    },
  });
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const proposal = (title, why, what) => `
## Why

${why}

## What Changes

${what.map((line) => `- ${line}`).join('\n')}

## Capabilities

### Modified Capabilities
- \`${title}\`: see the delta specification for this change

## Impact

Affects the service layer and its public API. No data migration.
`;

const design = (context, decision) => `
## Context

${context}

## Goals / Non-Goals

**Goals:**

- Behaviour that is the same on a retry as on the first attempt
- Failures that say what failed rather than that something failed

**Non-Goals:**

- Changing the public payload shape. Consumers are already parsing it.

## Decisions

${decision}

## Risks / Trade-offs

**Backfill is the expensive part.** The change itself is small; applying it to
existing rows is what takes a maintenance window.

## Migration Plan

Deploy behind a flag, backfill, then remove the flag.
`;

const deltaSpec = (requirement, statement, scenarios) => `
## ADDED Requirements

### Requirement: ${requirement}
${statement}

${scenarios
  .map(
    (s) => `#### Scenario: ${s.name}
- **WHEN** ${s.when}
- **THEN** ${s.then}`,
  )
  .join('\n\n')}
`;

const capabilitySpec = (name, purpose, requirements) => `
# ${name}

## Purpose

${purpose}

## Requirements

${requirements
  .map(
    (r) => `### Requirement: ${r.name}
${r.statement}

#### Scenario: ${r.scenario.name}
- **WHEN** ${r.scenario.when}
- **THEN** ${r.scenario.then}`,
  )
  .join('\n\n')}
`;

const taskList = (groups) =>
  groups
    .map(
      (group, index) =>
        `## ${index + 1}. ${group.title}\n\n${group.tasks
          .map((task, i) => `- [${task.done ? 'x' : ' '}] ${index + 1}.${i + 1} ${task.text}`)
          .join('\n')}`,
    )
    .join('\n\n');

/** Writes one change directory, with only the artifacts its lane calls for. */
function change(projectRoot, name, parts, location = 'changes') {
  const base = join(projectRoot, 'openspec', location, name);
  write(join(base, '.openspec.yaml'), 'schema: spec-driven\ncreated: 2026-07-28');
  for (const [file, body] of Object.entries(parts)) write(join(base, file), body);
}

// ---------------------------------------------------------------------------
// orbit: the project with a full board and a remote
// ---------------------------------------------------------------------------

function buildOrbit(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.name', 'Dana Okafor');
  git(dir, 'config', 'user.email', 'dana@example.com');

  write(
    join(dir, 'README.md'),
    `
# orbit

Delivery for outbound events: webhooks, digests, and the retry behaviour behind
both. Invented for a screenshot.
`,
  );

  write(
    join(dir, 'openspec', 'specs', 'webhooks', 'spec.md'),
    capabilitySpec(
      'webhooks',
      'Delivering events to endpoints a customer controls, including what happens when that endpoint is down.',
      [
        {
          name: 'Deliveries are signed',
          statement:
            'The system SHALL sign every delivery with the endpoint secret, and SHALL include the timestamp in the signed payload.',
          scenario: {
            name: 'Endpoint receives an event',
            when: 'an event is delivered',
            then: 'the request carries a signature over the body and the timestamp',
          },
        },
        {
          name: 'A failed delivery is retried with backoff',
          statement:
            'The system SHALL retry a failed delivery on an increasing interval, and SHALL stop after the endpoint has been failing for 24 hours.',
          scenario: {
            name: 'Endpoint is down',
            when: 'an endpoint returns a server error',
            then: 'the delivery is retried later rather than dropped',
          },
        },
      ],
    ),
  );

  write(
    join(dir, 'openspec', 'specs', 'notifications', 'spec.md'),
    capabilitySpec(
      'notifications',
      'What a person is told, through which channel, and how often.',
      [
        {
          name: 'A person can choose their channel',
          statement:
            'The system SHALL let each person select the channels they receive notifications on, and SHALL default to email.',
          scenario: {
            name: 'No preference has been set',
            when: 'a person has never opened their notification settings',
            then: 'they receive email and nothing else',
          },
        },
      ],
    ),
  );

  // draft: a change that has been started and nothing written yet
  change(dir, 'add-delivery-metrics', {});

  // proposed: the why is written, the how is not
  change(dir, 'add-audit-log', {
    'proposal.md': proposal(
      'audit-log',
      'Support cannot answer "who changed this endpoint" without reading the database, and the answer they give is a guess.',
      [
        'An append-only record of every change to an endpoint',
        'A read API scoped to the account that owns the record',
        'Retention of 400 days, which covers an annual review',
      ],
    ),
  });

  // specified: planning is finished, the task list is not written
  change(dir, 'redesign-digest-schedule', {
    'proposal.md': proposal(
      'notifications',
      'The daily digest goes out at midnight UTC, which is the middle of the working day for half the accounts using it.',
      [
        'Digests scheduled in the recipient timezone',
        'A per-account quiet period that delays rather than drops',
        'One digest per period even when the scheduler runs twice',
      ],
    ),
    'design.md': design(
      'The scheduler is a single cron running at a fixed hour. Timezone is stored on the person but has never been read.',
      `### Schedule per timezone rather than per person

Scheduling per person means a job per person. Grouping by timezone means 38 jobs
covering every recipient, and the group is already indexed.

### The quiet period delays rather than drops

A digest suppressed during a quiet period is a digest the recipient never gets.
Delaying it to the end of the period keeps the guarantee that a digest covering a
period is always sent.`,
    ),
    'specs/notifications/spec.md': deltaSpec(
      'Digests arrive in the recipient timezone',
      'The system SHALL send each digest at the configured hour in the recipient timezone, and SHALL send exactly one digest per period.',
      [
        {
          name: 'Recipient has a timezone',
          when: 'a digest is due',
          then: 'it is sent at the configured hour where the recipient is',
        },
        {
          name: 'Scheduler runs twice for the same period',
          when: 'the scheduler runs again for a period already sent',
          then: 'no second digest is sent',
        },
      ],
    ),
  });

  // ready: everything written, nothing started
  change(dir, 'add-endpoint-rotation', {
    'proposal.md': proposal(
      'webhooks',
      'Rotating an endpoint secret means deleting the endpoint and creating a new one, which drops every event in between.',
      [
        'A second active secret during a rotation window',
        'Both secrets accepted while the window is open',
        'The old secret retired automatically when the window closes',
      ],
    ),
    'design.md': design(
      'Each endpoint has exactly one secret. Verification reads that column directly.',
      `### Two secrets, not a versioned secret

A version number means every consumer has to learn about versions. Two columns and
a window means the consumer changes nothing and the rotation is invisible to them.`,
    ),
    'specs/webhooks/spec.md': deltaSpec(
      'A secret can be rotated without losing deliveries',
      'The system SHALL accept both the previous and the current secret while a rotation window is open, and SHALL retire the previous secret when it closes.',
      [
        {
          name: 'Rotation window is open',
          when: 'a delivery is signed with the previous secret',
          then: 'it is accepted',
        },
        {
          name: 'Rotation window has closed',
          when: 'a delivery is signed with the retired secret',
          then: 'it is rejected and the rejection says the secret was retired',
        },
      ],
    ),
    'tasks.md': taskList([
      {
        title: 'Storage',
        tasks: [
          { text: 'Add the previous secret and the window expiry to the endpoint', done: false },
          { text: 'Backfill existing endpoints with no previous secret', done: false },
        ],
      },
      {
        title: 'Verification',
        tasks: [
          { text: 'Accept either secret while the window is open', done: false },
          { text: 'Reject the previous secret once the window has closed', done: false },
        ],
      },
      {
        title: 'API',
        tasks: [
          { text: 'Add the rotate endpoint and return the new secret once', done: false },
          { text: 'Report the remaining window on the endpoint resource', done: false },
        ],
      },
    ]),
  });

  // in progress: the lane most projects spend most of their time in
  change(dir, 'add-webhook-retries', {
    'proposal.md': proposal(
      'webhooks',
      'A failed delivery is dropped. Customers find out from their own users, and the only fix is asking us to replay by hand.',
      [
        'Retries on an increasing interval for 24 hours',
        'A delivery log the customer can read themselves',
        'A replay action for anything that exhausted its retries',
      ],
    ),
    'design.md': design(
      'Delivery is a fire and forget call inside the request that produced the event, so a slow endpoint slows the caller and a failed one is lost.',
      `### Deliveries move to a queue

Delivering inside the request couples the caller's latency to the customer's server.
The queue makes retrying possible at all, and takes the customer's uptime out of our
response time.

### The schedule is exponential with jitter

An endpoint that fails usually fails for every delivery at once. Without jitter the
retries arrive together, which is what took it down in the first place.`,
    ),
    'specs/webhooks/spec.md': deltaSpec(
      'Deliveries survive an endpoint being down',
      'The system SHALL retry a failed delivery on an exponential schedule with jitter for 24 hours, and SHALL record every attempt.',
      [
        {
          name: 'Endpoint is temporarily down',
          when: 'a delivery fails and the endpoint recovers within the window',
          then: 'a later attempt succeeds and the event is delivered exactly once',
        },
        {
          name: 'Endpoint stays down',
          when: 'every attempt within the window fails',
          then: 'the delivery is marked exhausted and can be replayed by the customer',
        },
      ],
    ),
    'tasks.md': taskList([
      {
        title: 'Queue',
        tasks: [
          { text: 'Move delivery out of the request path onto the queue', done: true },
          {
            text: 'Record an attempt row for every try, including the response status',
            done: true,
          },
          { text: 'Schedule the next attempt with exponential backoff and jitter', done: true },
        ],
      },
      {
        title: 'Exhaustion',
        tasks: [
          { text: 'Stop retrying after 24 hours of failures', done: true },
          { text: 'Mark the delivery exhausted and notify the account owner once', done: false },
        ],
      },
      {
        title: 'Replay',
        tasks: [
          { text: 'Add a replay action for an exhausted delivery', done: false },
          { text: 'Refuse to replay a delivery that already succeeded', done: false },
        ],
      },
      {
        title: 'Delivery log',
        tasks: [
          { text: 'Expose attempts on the delivery resource', done: false },
          { text: 'Page the log rather than returning every attempt', done: false },
        ],
      },
    ]),
  });

  // The history is built in two commits so the timeline has something to show.
  // A single commit would date every change to the same second.
  commit(dir, 'Set up orbit', '2026-07-28T09:12:00-04:00');

  // done: finished but not archived
  change(dir, 'add-signature-timestamps', {
    'proposal.md': proposal(
      'webhooks',
      'A signature with no timestamp can be replayed forever. Every consumer has to solve that themselves, and most do not.',
      ['The timestamp inside the signed payload', 'A documented tolerance window'],
    ),
    'design.md': design(
      'Signatures cover the body only.',
      `### The timestamp is signed, not sent alongside

A timestamp outside the signature can be edited, which makes it decoration.`,
    ),
    'specs/webhooks/spec.md': deltaSpec(
      'Signatures cannot be replayed indefinitely',
      'The system SHALL include the send time in the signed payload, and SHALL document the tolerance a receiver should apply.',
      [
        {
          name: 'Receiver checks the timestamp',
          when: 'a delivery arrives outside the tolerance window',
          then: 'the receiver can reject it using only the signed payload',
        },
      ],
    ),
    'tasks.md': taskList([
      {
        title: 'Signing',
        tasks: [
          { text: 'Include the send time in the signed payload', done: true },
          { text: 'Send the timestamp in a header for convenience', done: true },
        ],
      },
      {
        title: 'Documentation',
        tasks: [{ text: 'State the recommended tolerance and why', done: true }],
      },
    ]),
  });

  // archived: shipped, and the specs it changed are now the specs
  change(
    dir,
    'add-endpoint-health',
    {
      'proposal.md': proposal(
        'webhooks',
        'Nobody notices an endpoint is failing until a person complains.',
        ['A health state per endpoint', 'An email when an endpoint starts failing'],
      ),
      'design.md': design(
        'Failures are visible in the log and nowhere else.',
        `### Health is derived from recent attempts

A stored health column has to be kept in step with reality. Reading the last twenty
attempts cannot disagree with them.`,
      ),
      'specs/webhooks/spec.md': deltaSpec(
        'An endpoint reports its health',
        'The system SHALL derive endpoint health from recent delivery attempts, and SHALL notify the account owner when an endpoint becomes unhealthy.',
        [
          {
            name: 'Endpoint starts failing',
            when: 'recent attempts to an endpoint are failing',
            then: 'the endpoint is reported unhealthy and the owner is emailed once',
          },
        ],
      ),
      'tasks.md': taskList([
        {
          title: 'Health',
          tasks: [
            { text: 'Derive health from the last twenty attempts', done: true },
            { text: 'Expose it on the endpoint resource', done: true },
          ],
        },
        {
          title: 'Notification',
          tasks: [{ text: 'Email the owner once per unhealthy transition', done: true }],
        },
      ]),
    },
    'changes/archive',
  );

  commit(dir, 'Ship endpoint health and signed timestamps', '2026-08-04T15:41:00-04:00');
  return dir;
}

/** A smaller project, for the projects view to have more than one card. */
function buildSmall(dir, name, changes) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.name', 'Dana Okafor');
  git(dir, 'config', 'user.email', 'dana@example.com');
  write(join(dir, 'README.md'), `# ${name}\n\nInvented for a screenshot.`);
  for (const [changeName, parts] of Object.entries(changes)) change(dir, changeName, parts);
  commit(dir, `Set up ${name}`, '2026-08-11T09:47:00-04:00');
  return dir;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

const orbit = buildOrbit(join(root, 'orbit'));

// A remote with a change nobody local has yet. This is the state that cannot be
// staged inside one repository, and it is the one worth showing.
const remote = join(root, 'orbit-remote.git');
git(root, 'init', '--bare', '-b', 'main', remote);
git(orbit, 'remote', 'add', 'origin', remote);
git(orbit, 'push', '-u', 'origin', 'main');

const teammate = join(root, 'teammate');
git(root, 'clone', remote, teammate);
git(teammate, 'config', 'user.name', 'Sam Reyes');
git(teammate, 'config', 'user.email', 'sam@example.com');
change(teammate, 'tighten-rate-limits', {
  'proposal.md': proposal(
    'webhooks',
    'The per-account limit is generous enough that one account can starve the queue for everyone else.',
    ['A per-endpoint limit alongside the account limit', 'A documented burst allowance'],
  ),
});
execFileSync('git', ['add', '-A'], { cwd: teammate, stdio: 'ignore' });
execFileSync('git', ['commit', '-m', 'Propose tighter rate limits'], {
  cwd: teammate,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    GIT_AUTHOR_NAME: 'Sam Reyes',
    GIT_AUTHOR_EMAIL: 'sam@example.com',
    GIT_COMMITTER_NAME: 'Sam Reyes',
    GIT_COMMITTER_EMAIL: 'sam@example.com',
    GIT_AUTHOR_DATE: '2026-08-13T16:20:00-04:00',
    GIT_COMMITTER_DATE: '2026-08-14T16:20:00-04:00',
  },
});
git(teammate, 'push', 'origin', 'main');
rmSync(teammate, { recursive: true, force: true });

// The local checkout learns the remote moved, without taking the change.
git(orbit, 'fetch', 'origin');

// Work that is committed but not pushed.
write(
  join(orbit, 'openspec', 'changes', 'add-webhook-retries', 'proposal.md'),
  proposal(
    'webhooks',
    'A failed delivery is dropped. Customers find out from their own users, and the only fix is asking us to replay by hand.',
    [
      'Retries on an increasing interval for 24 hours',
      'A delivery log the customer can read themselves',
      'A replay action for anything that exhausted its retries',
      'A per-endpoint concurrency cap, so one slow endpoint cannot hold the queue',
    ],
  ),
);
commit(orbit, 'Cap concurrency per endpoint', '2026-08-14T11:05:00-04:00');

// And work that is not committed at all. It goes on a change that is already in
// progress, so every lane still has something in it.
write(
  join(orbit, 'openspec', 'changes', 'add-webhook-retries', 'tasks.md'),
  taskList([
    {
      title: 'Queue',
      tasks: [
        { text: 'Move delivery out of the request path onto the queue', done: true },
        { text: 'Record an attempt row for every try, including the response status', done: true },
        { text: 'Schedule the next attempt with exponential backoff and jitter', done: true },
      ],
    },
    {
      title: 'Exhaustion',
      tasks: [
        { text: 'Stop retrying after 24 hours of failures', done: true },
        { text: 'Mark the delivery exhausted and notify the account owner once', done: true },
      ],
    },
    {
      title: 'Replay',
      tasks: [
        { text: 'Add a replay action for an exhausted delivery', done: false },
        { text: 'Refuse to replay a delivery that already succeeded', done: false },
      ],
    },
    {
      title: 'Delivery log',
      tasks: [
        { text: 'Expose attempts on the delivery resource', done: false },
        { text: 'Page the log rather than returning every attempt', done: false },
      ],
    },
  ]),
);

buildSmall(join(root, 'atlas'), 'atlas', {
  'add-saved-views': {
    'proposal.md': proposal('search', 'Every person rebuilds the same three filters daily.', [
      'Named filters saved per person',
      'A shared view an account can pin for everyone',
    ]),
    'design.md': design(
      'Filters live in the query string and nowhere else.',
      `### Views are rows, not query strings

A saved query string breaks the moment a filter is renamed.`,
    ),
    'specs/search/spec.md': deltaSpec(
      'A filter can be saved and reused',
      'The system SHALL let a person save a set of filters under a name and apply it later.',
      [
        {
          name: 'Saved view is applied',
          when: 'a saved view is chosen',
          then: 'its filters are applied in full',
        },
      ],
    ),
    'tasks.md': taskList([
      {
        title: 'Persistence',
        tasks: [
          { text: 'Store a view as filters rather than as a query string', done: true },
          { text: 'Scope a view to its owner unless it is shared', done: true },
        ],
      },
      {
        title: 'Interface',
        tasks: [
          { text: 'Save the current filters under a name', done: true },
          { text: 'Apply and delete a saved view', done: false },
        ],
      },
    ]),
  },
  'add-bulk-export': {
    'proposal.md': proposal('search', 'Exports are capped at 1000 rows with no way to page.', [
      'An export that streams rather than buffers',
      'A signed link that expires',
    ]),
  },
});

buildSmall(join(root, 'harbor'), 'harbor', {
  'add-container-limits': {
    'proposal.md': proposal('scheduling', 'A container with no memory limit takes down its host.', [
      'A default limit applied at admission',
      'A clear rejection when a request exceeds the account ceiling',
    ]),
    'design.md': design(
      'Limits are optional and usually omitted.',
      `### Defaults are applied at admission

Applying a default at scheduling time means the request that was accepted is not the
one that runs.`,
    ),
    'specs/scheduling/spec.md': deltaSpec(
      'Every workload has a memory limit',
      'The system SHALL apply a default memory limit to any workload submitted without one.',
      [
        {
          name: 'Workload omits a limit',
          when: 'a workload is submitted with no memory limit',
          then: 'the account default is applied and recorded',
        },
      ],
    ),
    'tasks.md': taskList([
      {
        title: 'Admission',
        tasks: [
          { text: 'Apply the account default when a limit is omitted', done: false },
          {
            text: 'Reject a request above the account ceiling with the ceiling in the message',
            done: false,
          },
        ],
      },
    ]),
  },
});

console.log(root);
