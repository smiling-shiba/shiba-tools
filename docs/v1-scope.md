# Shiba Tools (`sht`): Scope

Status: Current. `shiba-tools` is a command-line tool. Editing happens in VS Code; there is no graphical editor.

## Goal

Author packs (a policy, YAML templates and assets) and get precise errors when a template refers to a function, hook, kind or argument that does not exist, before anything reaches a match. In CI, sign the result for official use. Format: `shiba-core/docs/pack-format.md`.

## Build order

1. **Contract** (in `shiba-core`): generate `contract.json` from a policy definition. *Not started; the validator uses a hand-written fixture contract.*
2. **Validator library:** parse YAML, check schemas, resolve references, check function and hook names and arguments against the contract, with file/line/column diagnostics and "did you mean" suggestions. *Done.*
3. **`sht validate`:** headless, used by CI. *Done.*
4. **`sht schemas`:** generate JSON Schemas so VS Code gives autocomplete, snippets and squiggles. *Done; not yet confirmed by hand in the editor.*
5. **`sht build-policy`:** policy source to a bundle plus contract, with a generated calver.
6. **`sht pack` and `sht verify`.**
7. **`sht sign`:** signs the policy hash (and, for the official ladder, the whole pack). Runs in CI only, with the key held as a CI secret.

**Hello world:** a template with `fn: set_valeu` gets a "did you mean `set_value`" diagnostic; fix it and validation passes.

## Out of scope

- Any graphical tool: editor, forms, docs browser, simulator.
- Simulation. Rule behavior is tested in `shiba-core`.
- Game content. Examples and fixtures use a neutral toy domain.

If a need for a graphical tool appears later, that is a new decision and a new design doc.

## Principles

- The tool reads the generated contract; it never inspects or runs policy bundle source.
- The command line and any future tool share one validator library. No second copy of validation logic.
- Schema diagnostics and semantic (function, hook, reference) diagnostics are distinguishable.
- A loaded policy bundle is executable code. Trusted local bundles only for now.

## Open

- Where the validator library lives: this repo or `shiba-core`.
- Whether `sht` also emits the canonical template JSON, or only validates and signs.
- A watch mode that revalidates and regenerates schemas as files change.
