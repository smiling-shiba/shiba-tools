# `sht build-policy`

Status: Current.

```sh
sht build-policy <policySource> [--pack <packDir>] [--version <calver>] [--force]
```

Builds a policy source file (TypeScript or JavaScript that default-exports `definePolicy(...)` from `shiba-sdk`) into `<packDir>/policies/` (default: the current folder):

- `<id>-policy-<calver>.js`: one minified ES module with everything bundled in
- `<id>-policy-<calver>.contract.json`: the generated contract, including the bundle's SHA-256

It then tells you to set `policy: <name>` in `pack.yml`, unless that is already set. It never edits `pack.yml`.

## Versions

- The calver (`YYYY.MM.DD.N`) is generated: today's date, with `N` one more than the highest build already in `policies/` for that day.
- If the source has not changed (same bundle hash as the newest build), nothing is written and the command says "Up to date".
- `--version` picks a calver instead. `--force` rebuilds unchanged source and replaces an existing version.

## What it checks

| Code | Severity | Meaning |
|---|---|---|
| SH600 | error | Policy source not found |
| SH601 | error | The policy imports a host module (`node:fs`, `path`, ...) |
| SH602 | error | Any other build error (syntax error, import that cannot be found) |
| SH603 | error | The policy threw while loading, or could not be loaded (the message is shown) |
| SH604 | error | The file does not default-export the result of `definePolicy(...)` |
| SH605 | error | The policy id cannot be used in file names |
| SH606 | error | `--version` is not a calver |
| SH607 | error | That version already exists (use `--force`) |
| SH608 | error | The policy produced an invalid contract |
| SH650 | warning | Non-deterministic API in your own source (`Math.random`, `Date.now`, `new Date`, `performance.now`, `fetch`, timers, `process`, `require`) |

`definePolicy` already rejects bad names, reserved fields and unknown references when the policy loads, so those show up as SH603 with the full list of problems.

## Things to know

- **It runs your policy code**, in a separate Node process, to read its definition. Only build code you trust.
- **It does not type-check.** Types are stripped, not verified. Run the TypeScript compiler in your project for that.
- **The determinism scan is a heuristic.** It reads only your own files (not `node_modules`), skips comment lines, and can miss or over-report. It warns; it never fails the build.
- **ES module output.** The bundle uses `export default`. Whether the embedded runtime in `shiba-mps` loads that form is checked in its spike (`MP-0001`).
- **Not yet:** signing (`sht sign`), packing (`sht pack`), and an automated test against the real SDK. Tests use a small stand-in for the SDK; the real one was checked by hand in a scratch project (see the backlog).
