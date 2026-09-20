# shiba-tools

Command-line tooling (alias `sht`) for Smiling Shiba rulesets. It will validate YAML
rulesets against the contract that `shiba-core` emits (handler names, argument
schemas, engine version) and, in CI, sign the result for official use.

This repository currently holds the toolchain and a dependency smoke test. The
validator library and the `sht` CLI are not written yet.

Planned scope and build order: [docs/v1-scope.md](docs/v1-scope.md).
Cross-repo architecture and decisions live in the `shiba-shared` repo's `docs/`.

## Setup

Use **Node.js 24** (npm comes with it). `.nvmrc` is provided for nvm and `mise.toml`
for mise; neither version manager is required.

```sh
node --version # should print v24.x.x
npm ci
```

Keep dependency changes in `package-lock.json`; do not generate a pnpm or Yarn lockfile.

No environment variables or credentials are needed.

## Checks

```sh
npm test               # run tests once
npm run test:watch     # rerun tests while editing
npm run lint           # Oxlint
npm run typecheck      # TypeScript, no emit
```

There is no formatter configured. Match the existing style and run
`git diff --check` for whitespace errors. All tests and lint must pass before
committing.

## Dependencies

- `typebox`, `ajv`, `ajv-formats`: schemas and validation
- `yaml`: parsing, with comment-preserving edits
- `vitest`, `fast-check`: tests and property tests
- `typescript`, `oxlint`, `@types/node`: tooling

New packages need approval. See `AGENTS.md`.

## Layout

- `tests/`: tests
- `docs/`: tooling docs (`v1-scope.md`)
- `AGENTS.md`: engineering rules for agents
- `dev/`: the owner's private, gitignored scratch pad. Do not use.
