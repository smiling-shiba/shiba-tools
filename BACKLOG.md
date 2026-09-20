# BACKLOG.md (shiba-tools)

Story prefix: `ST-`. Epic definitions live in the `shiba-shared` repo's `BACKLOG.md`. Tag stories with `[SS-NN]`.

Convention: `shiba-shared/docs/engineering/backlog-and-ids.md`. Keep "Now" to 3 items or fewer. Scope: [docs/v1-scope.md](docs/v1-scope.md).

## Now

## Next

- [ ] `ST-0001` [SS-01] Validator library: parse YAML and check it against a JSON Schema, with file/line/column diagnostics.
- [ ] `ST-0002` [SS-01] Check handler names and arguments against `manifest.json`, with "did you mean" suggestions.
- [ ] `ST-0003` [SS-01] `sht validate` CLI command.
- [ ] `ST-0004` [SS-01] Document VS Code YAML schema wiring for autocomplete and squiggles.

## Later / Ideas

- [ ] `ST-0005` [SS-01] `sht build`: compile YAML to canonical JSON and hash it.
- [ ] `ST-0006` [SS-01] `sht sign`: sign ruleset hash plus bundle hash. Runs in CI only.
- [ ] `ST-0007` Decide where the validator library lives: this repo or `shiba-core`.
- [ ] `ST-0008` Add the `bin` entry so `sht` is a real command.

## Blocked

- [ ] `ST-0002` also depends on `SC-0003` in `shiba-core` (manifest emit). Until that exists, develop against a hand-written fixture manifest.

## Done (recent)

- [x] `ST-0000` Strip UI dependencies, switch to npm, reset repo to a CLI-only toolchain.
