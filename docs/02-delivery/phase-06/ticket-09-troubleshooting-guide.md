# `P6.09 Troubleshooting Guide`

## Goal

Document the most likely failure checks, log-inspection paths, and diagnosis steps for the validated Synology baseline after the happy path has been proven.

## Why This Ticket Exists

Troubleshooting is part of the committed scope, but it serves a different purpose than the fresh walkthrough. It should stand on top of the validated baseline rather than being mixed into the final happy-path proof.

## Scope

- document where an operator should look first when the validated baseline is unhealthy
- cover log inspection and high-probability failure diagnosis for storage, mounts, env injection, daemon behavior, and Transmission connectivity
- keep the canonical runbook concise and operator-usable while storing deeper evidence and observations in the ticket rationale
- use screenshots only where DSM or Container Manager UI ambiguity makes them materially helpful

## Out Of Scope

- proving the happy path from a fresh environment
- portability advice for other Synology baselines
- speculative failure matrices for non-validated environments

## Rationale

- `Red first:` a runbook that reaches green once but does not explain where to look when it fails is not operationally credible.
- `Why this path:` a dedicated troubleshooting ticket lets the earlier happy-path proof stay focused while still making diagnosis part of the validated baseline.
- `Alternative considered:` folding troubleshooting into the final walkthrough was rejected because it would dilute both the clean-environment proof and the operator-facing diagnosis guidance.
- `Deferred:` portability and explicit non-validated differences remain the last ticket.
