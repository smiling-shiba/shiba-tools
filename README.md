# shiba-tools

Command-line tooling (alias `sht`) for Smiling Shiba rulesets. It will validate YAML
rulesets against the contract that `shiba-core` emits (handler names, argument
schemas, engine version) and, in CI, sign the result for official use.

This repository currently holds the toolchain and a dependency smoke test. The
validator library and the `sht` CLI are not written yet.

Planned scope and build order: [docs/v1-scope.md](docs/v1-scope.md).
Cross-repo architecture and decisions live in the `shiba-dev` repo's `docs/`.

## Setup

Use **Node.js 24** and **pnpm 12.5.1**. `.nvmrc` is provided for nvm and `mise.toml`
for mise; neither version manager is required.

```sh
node --version # should print v24.x.x
npm install --global pnpm@12.5.1
pnpm install --frozen-lockfile
```

If you prefer not to install pnpm globally, replace `pnpm` with `npx --yes pnpm@12.5.1`.
Keep dependency changes in `pnpm-lock.yaml`; do not generate an npm or Yarn lockfile.

No environment variables or credentials are needed.

## Checks

```sh
pnpm test       # run tests once
pnpm test:watch # rerun tests while editing
pnpm lint       # Oxlint
pnpm typecheck  # TypeScript, no emit
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
