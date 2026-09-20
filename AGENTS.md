# AGENTS.md

## Purpose

This file defines the default engineering standards for AI agents working in **Shiba repositories**.

Treat these rules as the baseline unless a repository contains more specific instructions that explicitly override them. Repository-specific architecture documents, ADRs, contribution guides, and task instructions take precedence when they are more specific.

The goal is simple: make useful changes without leaving behind broken builds, stale documentation, unnecessary dependencies, mystery abstractions, or future-agent traps.

---

# 1. Non-negotiable completion rules

Work is not complete until the relevant repository checks pass.

At minimum, when the repository supports them:

- tests pass,
- lint passes,
- type checking passes,
- the relevant build passes,
- formatting checks pass,
- generated artifacts are current if the project tracks them.

Do not:

- weaken a test just to make it pass,
- delete a failing test without understanding why,
- suppress compiler/linter errors without a documented reason,
- declare success while known checks are failing,
- normalize flaky tests by rerunning them until they happen to pass.

If a check cannot be run, state that clearly and explain why.

---

# 2. Git and branch discipline

## Never commit directly to `main`

AI agents must **never commit directly to `main`**.

Use a feature, fix, chore, or similarly appropriate branch.

Do not:

- force-push unless explicitly requested,
- rewrite shared history unless explicitly requested,
- merge to `main` unless explicitly authorized and the workflow permits it,
- discard unrelated user changes,
- reset or clean files you did not create without permission.

The human maintainer is allowed to violate the direct-to-main rule personally.

Agents are not.

Do not lecture the human maintainer about this asymmetry. Life is unfair.

---

# 3. Stay inside the task

Make the smallest coherent change that solves the requested problem.

Avoid:

- unrelated refactors,
- drive-by formatting of large files,
- renaming things merely because you prefer another name,
- replacing libraries or frameworks without a task-driven reason,
- speculative infrastructure,
- abstractions that have only one hypothetical future caller.

If cleanup is necessary to make the requested change safe or understandable, keep it local and explain it.

---

# 4. Dependency policy

Do not add a new dependency unless:

1. it was explicitly requested, or
2. you receive approval before adding it.

Before proposing a dependency:

- check whether the language/runtime already provides what is needed,
- check whether an existing project dependency already solves it,
- prefer a small implementation over a large package for a tiny problem,
- consider maintenance activity,
- consider license compatibility,
- consider security history,
- consider runtime/bundle/build impact,
- consider portability across supported platforms.

Do not add packages because they are fashionable or convenient for the agent.

Use the repository's existing package manager, lockfile, and dependency conventions.

---

# 5. Code style

Prefer code that is:

- readable,
- explicit,
- unsurprising,
- testable,
- easy to delete or change later.

Prefer boring code over clever code.

Use names from the problem domain rather than implementation trivia.

Keep functions and modules focused.

Avoid:

- giant utility modules,
- hidden global state,
- magic constants,
- deeply nested conditionals when simpler control flow is possible,
- clever metaprogramming without a strong reason,
- commented-out dead code,
- copy/paste implementations that should obviously share behavior.

Delete dead code instead of preserving it "just in case."

---

# 6. Types and validation

Use the strongest practical type system available in the repository.

Where applicable:

- avoid untyped escape hatches such as `any`,
- prefer explicit domain types,
- validate untrusted data at system boundaries,
- distinguish IDs/types that are semantically different,
- represent impossible states so they are difficult to construct,
- avoid unchecked casts when validation is possible.

Compiler suppression directives require a concrete reason.

Do not use type assertions as a substitute for understanding the data.

---

# 7. Architecture boundaries

Respect existing architectural boundaries.

Do not bypass them because doing so is faster for one task.

Typical boundaries include:

- domain logic vs. presentation,
- application logic vs. infrastructure,
- client intent vs. authoritative server state,
- persistence vs. domain models,
- platform-specific adapters vs. shared core code.

Shared/core modules should not casually import UI frameworks, platform APIs, databases, networking frameworks, or filesystem code.

If a change appears to require violating an established boundary, stop and evaluate whether the architecture needs an explicit decision instead.

---

# 8. Testing standards

Tests should protect behavior, not implementation trivia.

Prefer tests that read conceptually as:

```text
given X
when Y
then Z
```

## Unit tests

Use unit tests for:

- domain rules,
- transformations,
- validation,
- state transitions,
- edge cases,
- error behavior.

## Integration tests

Use integration tests for important boundaries such as:

- API ↔ service,
- client ↔ server,
- service ↔ persistence,
- serialization/deserialization,
- external adapters.

## End-to-end tests

Use E2E tests for critical user journeys, not every small interaction.

## Regression tests

A bug fix should normally include a test that would have failed before the fix.

## Determinism

Tests must not depend on uncontrolled randomness, wall-clock timing, execution order, or production services.

Inject or seed randomness when needed.

Prefer deterministic synchronization over arbitrary sleeps.

## Coverage

Do not chase a vanity coverage percentage.

Critical behavior should be well covered. Boilerplate does not need tests solely to increase a number.

## Skipped tests

Do not leave permanently skipped tests without a clear documented reason.

---

# 9. Error handling

Do not silently swallow failures.

Expected domain errors should be explicit and understandable.

Unexpected errors should retain enough technical context to diagnose them.

User-facing errors should:

- be understandable,
- avoid exposing secrets or internals,
- suggest a useful next action when possible.

Logs should contain technical details that are inappropriate for user-facing messages.

Network disconnects, retries, timeouts, cancellation, and partial failure should be treated as normal system conditions where relevant.

---

# 10. Logging

Use structured logging for production services where practical.

Logs should be useful for answering:

- what happened,
- where,
- when,
- in which request/session/job/match,
- and why it failed.

Use appropriate severity levels such as:

```text
debug
info
warn
error
```

Do not:

- spam hot loops,
- log secrets,
- log auth tokens,
- log passwords,
- log private data merely for convenience,
- use logs as a substitute for metrics or product analytics.

Production services should generally write logs to stdout/stderr and let the runtime/platform handle collection.

Do not introduce a logging vendor or library without following the dependency policy.

---

# 11. Analytics and event tracking

Product analytics is not the same thing as operational logging.

Keep analytics behind a small interface or adapter.

Do not scatter vendor SDK calls throughout domain code.

Event names should be:

- deliberate,
- stable,
- documented,
- versioned when breaking payload changes matter.

Collect the minimum useful data.

Avoid sensitive personal information.

Self-hosted/local/offline usage must not silently send analytics unless the product explicitly defines that behavior.

---

# 12. Documentation hygiene

Documentation is maintained product surface.

## README.md

Keep `README.md` accurate and useful.

It is not:

- a scratchpad,
- a changelog,
- a graveyard,
- a dumping ground,
- a place to endlessly append corrections beneath obsolete instructions.

When setup, commands, architecture, configuration, or contributor workflow changes, update the relevant documentation.

Remove stale instructions.

Move detailed material into focused docs when the README would otherwise become bloated.

## Comments

Comments should explain **why**, constraints, or non-obvious behavior.

Do not narrate obvious code.

## TODOs

A TODO must explain what remains and why.

Good:

```text
TODO: restore match state after reconnect once persistence API is available.
```

Bad:

```text
TODO: fix this
```

---

# 13. Environment configuration hygiene

Maintain example configuration files such as:

```text
.env.example
.env.template
config.example.yml
```

Rules:

- every required setting should be represented,
- example values must be safe placeholders,
- never include real secrets,
- remove obsolete settings,
- group related settings,
- briefly document non-obvious values,
- fail clearly when required production configuration is missing.

Do not silently invent dangerous production defaults.

---

# 14. Secrets and security

Never commit:

- passwords,
- API keys,
- auth tokens,
- private certificates,
- signing keys,
- production credentials.

Treat client input, uploaded content, remote data, environment configuration, and mod/plugin content as untrusted at appropriate boundaries.

For authoritative systems:

- clients send intent,
- servers validate,
- servers decide truth.

Do not trust client-provided state merely because the official client generated it.

Security-sensitive shortcuts require explicit approval.

---

# 15. Persistence and migrations

Persistent schema changes must be deliberate.

Where migrations exist:

- use them,
- do not modify an already-applied production migration,
- add a new migration instead,
- make failures visible,
- avoid silent data loss.

When changing persisted file formats, save formats, protocols, or schemas, consider:

- backward compatibility,
- migration strategy,
- versioning,
- rollback behavior.

Do not silently corrupt or discard old data.

---

# 16. API and protocol changes

Treat public APIs, network protocols, file formats, and shared schemas as contracts.

Breaking changes should be deliberate.

Where appropriate:

- version contracts,
- provide migrations,
- maintain compatibility during transitions,
- add contract tests.

Do not let client and server schemas drift independently.

---

# 17. Concurrency and asynchronous work

Be explicit about ownership and lifecycle.

Avoid:

- orphaned tasks,
- unbounded queues,
- hidden background loops,
- races caused by shared mutable state,
- retries with no limit or backoff.

Cancellation should be respected where the platform supports it.

Async failures must surface somewhere meaningful.

---

# 18. Performance

Measure before optimizing.

Do not build complicated architecture around imagined future scale.

Still avoid obviously wasteful behavior in hot paths.

Prefer:

- bounded work,
- compact state,
- batched operations where appropriate,
- avoiding unnecessary serialization,
- avoiding unnecessary client/server chatter,
- avoiding repeated expensive work that can be safely reused.

If performance motivated a non-obvious design, document the evidence.

---

# 19. Containers and infrastructure

Containerize things when containers solve an actual deployment, CI, or integration problem.

Do not containerize everything because Docker exists.

Good candidates:

- backend services,
- infrastructure dependencies,
- integration-test environments,
- production service images.

Poor candidates unless explicitly required:

- desktop GUI applications,
- local developer tools that are simpler natively,
- processes wrapped in containers solely for aesthetic consistency.

Keep infrastructure simple until complexity is justified.

Do not build a Kubernetes theme park for three users and a dog.

---

# 20. Generated files and repository hygiene

Do not leave behind:

- temporary files,
- debug dumps,
- accidental screenshots,
- build artifacts that are not meant to be tracked,
- editor metadata,
- abandoned prototypes,
- unexplained generated files.

If a generated file is tracked, regenerate it using the canonical process.

Do not manually edit generated output unless the repository explicitly expects that workflow.

---

# 21. Architecture decisions

For decisions that are expensive to reverse or likely to confuse future maintainers, use an ADR if the repository supports them.

Good ADR candidates:

- core framework changes,
- persistence technology,
- major protocol choices,
- authoritative-server boundaries,
- security models,
- major third-party platform dependencies.

Do not create an ADR for trivial implementation choices.

---

# 22. Review your own work

Before presenting work as complete:

1. inspect the diff,
2. remove accidental changes,
3. check naming,
4. check error paths,
5. check edge cases,
6. check tests,
7. check documentation,
8. check configuration examples,
9. check for secrets,
10. run the relevant validation commands.

Do not rely on the reviewer to discover obvious mistakes you could have caught yourself.

---

# 23. When uncertain

Do not invent repository conventions.

Inspect the existing codebase first.

Prefer consistency with established patterns unless those patterns are clearly broken or the task explicitly asks to change them.

Ask before making a decision that is:

- expensive to reverse,
- security-sensitive,
- dependency-heavy,
- externally visible,
- destructive,
- or outside the requested scope.

For small, reversible implementation details, make a sensible choice and proceed.

---

# 24. Agent communication

Be concise and concrete.

When finishing a task, report:

- what changed,
- important design choices,
- checks run and their results,
- anything intentionally left unresolved.

Do not claim:

- tests passed if they were not run,
- a build works if it was not built,
- a bug is fixed without evidence,
- a file was changed when it was not.

If blocked, explain the blocker and the smallest decision or input needed to continue.

---

# Default Shiba engineering philosophy

When several solutions are valid, prefer the one that is:

1. easier to understand,
2. easier to test,
3. easier to change,
4. harder to misuse,
5. less dependent on unnecessary technology.

Keep the repository boring in the places that should be boring.

Save the weirdness for the product.
