# Autocomplete in VS Code

Status: Current. Generated schemas are tested against `sht validate`; behavior inside VS Code itself (completions, snippets, hover text) has not been confirmed by hand yet, see `ST-0013` in the backlog.

## Setup

1. Install VS Code and the **YAML** extension by Red Hat (`redhat.vscode-yaml`). VS Code does not understand JSON Schema in YAML files without it.
2. Generate the schemas for a pack:

   ```sh
   npm run sht -- schemas tests/fixtures/toy-pack
   ```

   This writes `.shiba/template.schema.json` and `.shiba/pack.schema.json` into the pack folder, and creates `.vscode/settings.json` there if none exists (an existing one is never modified; the command prints what to add).
3. Open the **pack folder** itself in VS Code (`code tests/fixtures/toy-pack`). The generated settings use paths relative to the folder you open.

Alternative without settings: put `# yaml-language-server: $schema=../../.shiba/template.schema.json` on the first line of a template (adjust the relative path).

## What to try

In `templates/entities/lamp.yml`:

- Put the cursor after `on:` and press Ctrl+Space. You should see `created` and `updated`, with their titles.
- Start a new step under `do:` (a line with `- `) and press Ctrl+Space. You should see a snippet per function (`add_tag`, `emit`, `set_value`). Choosing `set_value` fills in `fn` and `args` with placeholders to tab through.
- After `fn:` press Ctrl+Space for the function names. With `fn: set_value` chosen, ctrl+space under `args:` offers `key` and `value`.
- Misspell a field (`nmae:`) or give `value:` a word instead of a number. You should get a red squiggle.

In `templates/collections/starter-set.yml`: put the cursor on a new list item under `entities:` and press Ctrl+Space. You should be offered `crate` and `lamp`.

In a new, empty file under `templates/`: press Ctrl+Space. You should be offered a skeleton for each kind.

In `pack.yml`: `policy:` completes to the policies found in `policies/`.

## What the editor cannot check

A schema looks at one file at a time, so it cannot see duplicate ids across files, and it does not check asset paths. Run `sht validate` for those and for anything else the editor missed.

## Keeping the schemas current

The schemas embed the policy's functions, hooks and kinds, and the ids of the templates that exist. Run `sht schemas` again after changing the policy or adding a template. A watch mode is planned (`ST-0013`).

## How it works

`template.schema.json` is one JSON Schema (draft-07) for all templates. It switches on `kind` with `if`/`then` branches, so the editor offers the fields, hooks, functions and arguments that belong to the kind being written. It also carries `defaultSnippets` for the snippet lists. `pack.schema.json` describes `pack.yml`. Both are generated from the policy's contract; nothing here needs the policy bundle.
