# Locking, signing and verifying a pack

Status: Current. Uses Node's built-in crypto (ed25519); no extra packages.

## The idea

1. **`sht pack`** checks the pack is valid, then writes `pack.lock.json`: a list of every file in the pack with its hash.
2. **`sht sign`** signs that list with a private key, writing `pack.sig.json`.
3. **`sht verify`** checks the files still match the list, and that the signature is genuine and from a key you trust.

Signing says two things: *these exact files* and *this signer*. It is not secrecy; anyone can read the files.

## Commands

```sh
sht pack [packDir]
sht keygen <name> [--out <dir>] [--force]
sht sign [packDir] --key <name>.key
sht verify [packDir] [--trust <name>.pub or a folder of *.pub] [--require-signature]
```

Typical run:

```sh
sht pack pack
sht keygen dev --out keys           # once: makes keys/dev.key (secret) and keys/dev.pub (public)
sht sign pack --key keys/dev.key
sht verify pack --trust keys/dev.pub --require-signature
```

## What gets locked

`pack.yml`, the active policy's bundle and contract, every template, and everything under the assets folder (dot files are skipped). Other policy versions kept in `policies/` are not part of the pack.

- **Templates, `pack.yml` and the contract** are hashed in canonical form (RFC 8785 JSON), so comments and formatting changes do not matter, but any real change does.
- **The policy bundle and assets** are hashed by their exact bytes.
- The lock has no timestamps, so the same pack always gives the same lock.

## Trust

The signature file carries the public key, so it can be checked on its own. That only proves *somebody's* key signed it. Trust is a separate step: pass `--trust` with a public key file, or a folder of `*.pub` files, whose signers you accept.

| Situation | Result |
|---|---|
| Unsigned pack | Warning (SH720). Error with `--require-signature`. |
| Valid signature, no `--trust` given | Warning: signer not established (SH722). Error with `--require-signature`. |
| Valid signature, key not in `--trust` | Error (SH722). |
| Valid signature from a trusted key | OK. |
| Files changed, added or missing since the lock | Error (SH712, SH714, SH713). |
| Lock changed after signing, or a forged signature | Error (SH721). |

This matches the plan for the app: local games can run unsigned packs with a warning, and the official ladder requires a signature from the official key.

## Keys

- `sht keygen` creates an ed25519 pair. The private key file is readable only by you. **Never commit it.** Share only the `.pub` file.
- The real signing key for official packs should live in CI only. Use a throwaway key for local work.
- `sht pack` deletes an existing `pack.sig.json` when the lock changes, because the old signature no longer matches; run `sht sign` again. `sht sign` refuses to sign if the lock is out of date.
- Not built: key rotation and revocation, passphrase-protected private keys.

## Diagnostic codes

| Code | Severity | Meaning |
|---|---|---|
| SH700 | error | The pack has validation errors; fix them before packing |
| SH701 | error | A file cannot be hashed (YAML syntax error, value JSON cannot hold, assets folder outside the pack) |
| SH710 | error | `pack.lock.json` not found; run `sht pack` |
| SH711 | error | `pack.lock.json` is not valid |
| SH712 | error | A file changed since the lock was made |
| SH713 | error | A file in the lock is missing |
| SH714 | error | A file is not in the lock |
| SH715 | error | The policy bundle is missing (run `sht build-policy`) |
| SH716 | error | The lock is out of date; run `sht pack` before signing |
| SH720 | warning / error | The pack is not signed |
| SH721 | error | The signature does not match the lock |
| SH722 | warning / error | The signer is not trusted, or not established (no `--trust`) |
| SH723 | error | `pack.sig.json` is not valid |
| SH730 | error | A key file problem (unreadable, wrong type, or would be overwritten) |
