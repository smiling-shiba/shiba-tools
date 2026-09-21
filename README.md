# shiba-tools

Command-line tooling (alias `sht`) for Smiling Shiba packs: a policy (rules as code),
YAML templates and assets. It validates templates against the policy's contract (kinds,
functions, hooks, argument schemas) and generates editor schemas. Building policies, packing,
signing and verifying are planned.

Today it can validate a pack (`sht validate`) and generate editor schemas (`sht schemas`).
The rest is tracked in `BACKLOG.md`.

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

## Usage

```sh
npm run sht -- validate <packDir>          # human-readable diagnostics
npm run sht -- validate <packDir> --json   # machine-readable
npm run sht -- schemas <packDir>           # editor schemas for VS Code autocomplete
```

Exit codes: 0 no errors (warnings allowed), 1 errors found, 2 bad usage. A pack is a
folder with `pack.yml`, `policies/`, `templates/` and `assets/`; the format is described in
`shiba-core/docs/pack-format.md`. Sample packs live in `tests/fixtures/`. Diagnostic codes
are listed in [docs/validation.md](docs/validation.md). Editor setup: [docs/vscode.md](docs/vscode.md).

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

- `src/`: the validator library and the `sht` command line
- `tests/`: tests, plus `tests/fixtures/toy-pack` (valid) and `tests/fixtures/broken-pack` (one broken template per problem)
- `docs/`: tooling docs (`v1-scope.md`)
- `AGENTS.md`: engineering rules for agents
- `dev/`: local, gitignored scratch space; not part of the project.
