# Validation: what `sht validate` checks

Status: Current for what is implemented. Design: `shiba-core/docs/pack-format.md`.

`sht validate <packDir>` reads `pack.yml`, finds the active policy's contract in `policies/`, and checks every template against it. It never reads or runs the policy bundle. It reports every problem it can find, sorted by file and position.

## Codes

The `SH` prefix is a placeholder until a real scheme is chosen.

| Code | Severity | Meaning |
|---|---|---|
| SH010 | error | YAML syntax error |
| SH011 | error | `pack.yml` missing, not a mapping, or a required field is missing or empty |
| SH012 | error | Contract missing, not valid JSON, wrong shape, invalid schema, or the policy name is not a plain file name |
| SH013 | error | Unknown `pack.yml` field |
| SH014 | warning | Policy bundle (`.js`) not found next to the contract |
| SH015 | warning | Policy name does not match its contract (`<id>-policy-<version>`) |
| SH016 | warning | No files match the `templates` pattern |
| SH101 | error | Unknown function in a step |
| SH102 | error | Unknown hook in `on` |
| SH103 | error | `on` without `do`, or `do` without `on` |
| SH104 | error | Malformed step (`do` not a list, step not a mapping, missing `fn`, `args` not a mapping) |
| SH105 | error | Unknown field in a step (only `fn` and `args` are allowed) |
| SH110 | error | Unknown template `kind` |
| SH120 | error | Missing or invalid `kind` |
| SH121 | error | Missing or invalid `id` |
| SH201 | error | Unknown template field |
| SH202 | error | Unknown function argument |
| SH203 | error | Template field breaks its kind's schema (or a required field is missing) |
| SH204 | error | Function argument breaks the function's schema (or a required argument is missing) |
| SH301 | error | Reference to an id that does not exist |
| SH302 | error | Duplicate id within a kind |
| SH501 | error | SDK version outside the pack's `sdk.range`, or the range cannot be understood |

Unknown names get a "Did you mean" suggestion when a close match exists.

## Conventions

- `kind`, `id`, `on` and `do` are framework fields, valid on every template and not listed in a kind's schema. Any other key not in the kind's schema is rejected.
- A reference field is marked in the kind's JSON Schema with the custom keyword `"x-shiba-ref": "<kind>"`, on a string or on the items of an array of strings.
- Ranges support space-separated comparators (`>=`, `>`, `<=`, `<`, `=`, or a bare version), for example `>=0.1.0 <0.2.0`. Carets, tildes and `||` are not supported.

## Not implemented yet

- Checking that asset paths referenced by templates exist.
- `build-policy`, `pack`, `sign`, `verify`.
- Watch mode.
