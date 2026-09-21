# BACKLOG.md (shiba-tools)

Story prefix: `ST-`. Epic definitions live in the `shiba-shared` repo's `BACKLOG.md`. Tag stories with `[SS-NN]`.

Convention: `shiba-shared/docs/engineering/backlog-and-ids.md`. Keep "Now" to 3 items or fewer. Scope: [docs/v1-scope.md](docs/v1-scope.md).

## Now

## Next

- [ ] `ST-0013` [SS-01] Confirm autocomplete by hand in VS Code (see `docs/vscode.md`) and fix anything that does not appear. Consider a watch mode that regenerates schemas.

## Later / Ideas

- [ ] `ST-0010` [SS-01] `sht build-policy`: policy source to `policies/<id>-policy-<calver>.js` + `.contract.json` + hash. Generates the calver.
- [ ] `ST-0011` [SS-01] `sht pack` and `sht verify`.
- [ ] `ST-0005` [SS-01] Canonicalize templates (YAML 1.2, sorted keys, RFC 8785 JSON) and hash them, as part of `sht pack`.
- [ ] `ST-0006` [SS-01] `sht sign`: sign the policy hash (and, for the official ladder, the whole pack). Runs in CI only; dev key locally.
- [ ] `ST-0012` [SS-01] Check that asset paths referenced by templates exist.
- [ ] `ST-0007` Decide where the validator library lives: this repo or `shiba-core`.
- [ ] `ST-0008` Add the `bin` entry so `sht` is a real command.

## Blocked

- Nothing. The validator runs against a hand-written fixture contract until `shiba-core` (`SC-0003`) generates real ones.

## Done (recent)

- [x] `ST-0009` Fixtures: `tests/fixtures/toy-pack` (valid) and `broken-pack` (one broken template per problem), neutral toy domain.
- [x] `ST-0001` Validator library: YAML parsing with line/column diagnostics, schema checks, references, duplicates.
- [x] `ST-0002` Function, hook and argument checks against `contract.json`, with "did you mean" suggestions.
- [x] `ST-0004` `sht schemas`: generates `.shiba/template.schema.json` and `pack.schema.json` (kind-aware fields, hooks, functions, arguments, reference ids, snippets) plus `.vscode/settings.json`.
- [x] `ST-0003` `sht validate` command (`npm run sht -- validate <packDir>`).
- [x] `ST-0000` Strip UI dependencies, switch to npm, reset repo to a CLI-only toolchain.
