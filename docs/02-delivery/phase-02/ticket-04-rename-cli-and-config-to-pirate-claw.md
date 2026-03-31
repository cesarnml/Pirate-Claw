# P2.04 Rename CLI And Config To Pirate Claw

Size: 2 points

## Outcome

- rename the executable from `media-sync` to `pirate-claw`
- rename the default config path from `media-sync.config.json` to `pirate-claw.config.json`
- update docs, examples, and manual verification to use the branded names only
- treat this as a clean break with no backward-compatibility aliases

## Red

- add or update CLI tests proving the branded command and default config name are the only supported interface
- prove outdated docs or examples still reference the old names until this ticket is implemented

## Green

- update the bin entrypoint, package metadata, default config constant, CLI-facing messages, and tests
- update README and Phase 02 docs to use `pirate-claw` and `pirate-claw.config.json`
- perform the final real-world manual verification with:
  - `./bin/pirate-claw run --config ./pirate-claw.config.json`

## Refactor

- remove the old names rather than carrying compatibility paths
- keep the rename scoped to the branded operator surface without changing unrelated internals

## Review Focus

- branded interface is consistent across executable, config file, docs, and tests
- no stale `media-sync` naming remains in the intended current-user workflow
