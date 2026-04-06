# `P7.04 Env-Backed Transmission Secrets`

## Goal

Allow Transmission username and password to come from env vars or `.env` so operators can keep those secrets out of the main config JSON when desired.

## Why This Ticket Exists

The current config shape requires embedding Transmission credentials directly in `pirate-claw.config.json`. That is awkward for operators who want to keep credentials separate while still using the same local CLI and daemon flows.

## Scope

- support loading Transmission username/password from env vars
- support `.env` as a local convenience source for those env vars
- define clear precedence between inline config values and env-backed values
- keep existing inline config behavior working unchanged when env vars are not used
- add tests covering env-backed loading and precedence behavior

## Out Of Scope

- external secret managers
- env-backed support for unrelated config sections
- broader config normalization visibility beyond what P7.03 already covers
- validation-polish work beyond what is needed to support env-backed secrets

## Rationale

- `Red first:` an operator should be able to remove Transmission credentials from the main JSON, provide them through env vars or `.env`, and still load a valid effective config.
- `Why this path:` env vars and `.env` are the smallest acceptable secret-separation mechanism because they fit the current local-CLI workflow without adding platform-specific secret integrations.
- `Alternative considered:` introducing a generalized secret-provider abstraction was rejected because it widens the config model far beyond the Transmission-only pain this phase is addressing.
- `Deferred:` non-Transmission secret providers, secret-manager integrations, and broader config-sourcing abstractions remain outside this ticket.
