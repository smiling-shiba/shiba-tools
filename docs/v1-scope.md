# Shiba Tools (`sht`): v1 Scope

Status: Proposal. Trims `dev/SHIBA_RULES_STUDIO.md` (the long product draft). Nothing here changes that file.

## Goal

Author YAML rulesets for Smiling Shiba and get precise errors when they reference handlers or arguments that do not exist, before anything reaches a match.

## Build order

1. **Contract** (in `shiba-core`): emit `manifest.json` and `api-schema.json` from the engine build. See `/Users/kevin/repo/shiba-core/docs/handlers-and-manifest.md`.
2. **Validator library:** parse YAML, check schema, resolve references, check handlers against the manifest. Diagnostics carry file, line, column, code and a suggestion ("Did you mean `on_card_drawn`?").
3. **CLI:** `validate` and `build` commands using the validator. Headless, used by CI.
4. **Editor support without a UI:** point VS Code's YAML support at the generated JSON Schema for autocomplete, hover and red squiggles.
5. **Studio UI** only if 1 to 4 leave a real gap.

**Hello world:** open a YAML file with `hook: on_card_drwawn`, get a "did you mean" diagnostic, fix it, build passes.

## Deferred until proven needed

- Monaco editor, generated forms, YAML/form dual editing
- Storybook, Playwright end-to-end suite, Docusaurus, typedoc
- Tauri host, file watching, profile hot-reload
- Docs browser, reference index/search
- Example games other than Smiling Shiba
- Simulator (rule tests live in `shiba-core`)
- Guide/Shiba Daemon authoring

## Principles kept from the original draft

- The studio never inspects bundle source; it reads the generated contract.
- CLI and any UI share one compiler and validator. No second copy of validation logic.
- Schema diagnostics and semantic (handler) diagnostics are distinguishable.
- Loaded engine bundles are executable code. Trusted local bundles only for now.

## Open

- Where the validator package lives (this repo or `shiba-core`).
- Whether a Studio UI is ever needed for a solo author.
