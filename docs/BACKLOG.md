# BACKLOG.md (shiba-tools)

Story prefix: `ST-`. Epic definitions live in the `shiba-shared` repo's `docs/BACKLOG.md`. Tag stories with `[SS-NN]`.

Convention: `shiba-shared/docs/engineering/backlog-and-ids.md`. Keep "Now" to 3 items or fewer. Scope: [v1-scope.md](v1-scope.md).

## Now

_Nothing in progress. The toolset is built. `SH-0002` and `SH-0009` are both decided now (`shiba-sdk` is on npm as `@smiling-shiba/sdk`; mods are data-only, D-45) — nothing here still waits on them._

## Next


## Later / Ideas

- [ ] `ST-0017` [SS-01] Key rotation and revocation, and passphrase-protected private keys.
- [ ] `ST-0018` [SS-01] Check `sht verify` inside the app's pack loader (`SA-0013`), with a folder of trusted keys.
- [ ] `ST-0015` [SS-01] Automated test of `build-policy` against the real `shiba-sdk` (checked by hand for now). Unblocked: `shiba-sdk` is on npm as `@smiling-shiba/sdk` (D-44).
- [ ] `ST-0016` [SS-01] `build-policy --activate` to set `policy:` in `pack.yml`.
- [ ] `ST-0014` [SS-01] Watch mode: revalidate and regenerate editor schemas when files change.
- [ ] `ST-0012` [SS-01] Check that asset paths referenced by templates exist.
- [ ] `ST-0007` Decide where the validator library lives: this repo or `shiba-sdk`.
- [ ] `ST-0008` Add the `bin` entry so `sht` is a real command.

## Blocked

- Nothing.

## Done (recent)

- [x] `ST-0011`, `ST-0005`, `ST-0006` `sht pack`, `keygen`, `sign` and `verify`: `pack.lock.json` (every file hashed; YAML and JSON in canonical form so comments and formatting do not matter) and `pack.sig.json` (ed25519 over the canonical lock), with `--trust` and `--require-signature`. Uses Node crypto; no new packages.
- [x] `ST-0010` `sht build-policy`: esbuild bundle (platform-neutral script) plus generated contract with the bundle hash, generated calver, unchanged-source detection, host-import rejection and a determinism warning scan. Checked end to end with the real SDK.
- [x] `ST-0013` Confirmed autocomplete by hand in VS Code (Red Hat YAML 1.24.0): hook, function and argument completion, step and template snippets, reference ids, and error squiggles.
- [x] `ST-0009` Fixtures: `tests/fixtures/toy-pack` (valid) and `broken-pack` (one broken template per problem), neutral toy domain.
- [x] `ST-0001` Validator library: YAML parsing with line/column diagnostics, schema checks, references, duplicates.
- [x] `ST-0002` Function, hook and argument checks against `contract.json`, with "did you mean" suggestions.
- [x] `ST-0004` `sht schemas`: generates `.shiba/template.schema.json` and `pack.schema.json` (kind-aware fields, hooks, functions, arguments, reference ids, snippets) plus `.vscode/settings.json`.
- [x] `ST-0003` `sht validate` command (`npm run sht -- validate <packDir>`).
- [x] `ST-0000` Strip UI dependencies, switch to npm, reset repo to a CLI-only toolchain.
