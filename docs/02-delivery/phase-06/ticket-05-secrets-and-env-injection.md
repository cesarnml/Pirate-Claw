# `P6.05 Secrets And Env Injection`

## Goal

Document and validate the full secret and environment-injection story for the validated Pirate Claw + Transmission Synology baseline.

## Why This Ticket Exists

Secret handling is one of the highest-ambiguity operator failure modes in a NAS runbook. It deserves a thin dedicated ticket after both containers exist rather than being half-implicit inside earlier setup steps.

## Scope

- document how Container Manager injects the required Pirate Claw and Transmission env/config values for the validated baseline
- validate the end-to-end secret path on the target NAS using fake-but-concrete example values in the runbook
- identify where secrets must remain operator-supplied and where the runbook can safely give concrete placeholders
- add operator-facing checks for secret/env-related failure diagnosis to the canonical runbook
- capture proof artifacts and any sensitive handling notes in the ticket rationale

## Out Of Scope

- new secret-provider integrations
- remote secret stores
- broader config ergonomics or CLI redesign
- upgrade-flow validation

## Rationale

- `Red first:` a “clean environment” runbook claim is not credible if the most failure-prone setup boundary is left partially implicit.
- `Why this path:` isolating secret and env injection after both containers exist keeps the earlier setup tickets smaller and makes review of this boundary sharper.
- `Alternative considered:` validating secrets inline within each container setup ticket was rejected because it would duplicate explanation and blur one shared operational failure domain across multiple tickets.
- `Deferred:` upgrade and restart semantics remain later tickets once the live secret path is proven.

## Rationale

- The validated baseline uses exactly two operator-supplied secrets (`PIRATE_CLAW_TRANSMISSION_USERNAME`, `PIRATE_CLAW_TRANSMISSION_PASSWORD`) injected via a `.env` file co-located with the config file under `/config/`.
- The `.env` path is resolved relative to the config file by `loadConfigEnv()` in `src/config.ts`, not by Bun's built-in `.env` auto-loader. This distinction matters because mounting `.env` at Bun's CWD (`/app`) triggers a silent crash on kernel 4.4 (see P6.04 rationale).
- Resolution priority (inline config > `.env` file > process env) gives operators flexibility while keeping the `.env` file as the recommended default for the Synology baseline.
- Transmission credentials live in `settings.json`, not Docker env, so credential alignment between the two containers is an explicit operator responsibility documented in the runbook.
- Non-secret Transmission env vars (`PUID`, `PGID`, `TZ`) are passed via Docker env at container creation and are safe to show as concrete examples.
- The `parseDotEnv()` implementation is minimal — no shell expansion, no quote stripping — which avoids complexity but means operators with special characters in passwords must not wrap values in quotes.
