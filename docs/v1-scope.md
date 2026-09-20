# Shiba Tools (`sht`): v1 Scope

Status: Current. `shiba-tools` is a command-line tool. There is no studio UI.

The long product draft this replaces (`dev/SHIBA_RULES_STUDIO.md`, gitignored) described a visual Rules Studio. That direction was dropped: for a solo author, validating and signing does not need a GUI.

## Goal

Author YAML rulesets for Smiling Shiba and get precise errors when they reference handlers or arguments that do not exist, before anything reaches a match. In CI, sign the validated result for official use.

## Build order

1. **Contract** (in `shiba-core`): emit `manifest.json` and `api-schema.json` from the engine build. See `shiba-core/docs/handlers-and-manifest.md`.
2. **Validator library:** parse YAML, check schema, resolve references, check handlers against the manifest. Diagnostics carry file, line, column, code and a suggestion ("Did you mean `on_card_drawn`?").
3. **`sht` CLI:** `validate` and `build` commands using the validator. Headless, used by CI.
4. **Editor support without a UI:** point VS Code's YAML support at the generated JSON Schema for autocomplete, hover and red squiggles.
5. **`sht sign`:** signs the ruleset hash and the engine bundle hash together. Runs in CI only, with the key held as a CI secret.

**Hello world:** open a YAML file with `hook: on_card_drwawn`, get a "did you mean" diagnostic, fix it, and the build passes.

## Out of scope

- Any GUI: editor, forms, docs browser, simulator, Tauri host.
- Monaco, Storybook, Playwright, Docusaurus, typedoc.
- File watching and hot-reload.
- Example games other than Smiling Shiba.
- Simulation. Rule behavior is tested in `shiba-core`'s own headless tests.
- Guide/Shiba Daemon authoring.

If a real need for a UI appears later, that is a new decision and a new spec.

## Principles kept from the original draft

- The tool never inspects bundle source; it reads the generated contract.
- CLI and any future UI share one compiler and validator. No second copy of validation logic.
- Schema diagnostics and semantic (handler) diagnostics are distinguishable.
- Loaded engine bundles are executable code. Trusted local bundles only for now.

## Open

- Where the validator package lives (this repo or `shiba-core`).
- Whether `sht` also builds and publishes the canonical ruleset JSON, or only validates and signs.
