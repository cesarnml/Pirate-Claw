# P1.01 CLI Skeleton And Config Loading

Size: 2 points

## Outcome

- add a runnable CLI entrypoint
- load a JSON config file from a predictable path or `--config`
- fail fast with a readable error when config is missing or malformed

## Red

- write an integration-style CLI test proving `media-sync run --config test-config.json` loads config
- write a failing test for invalid JSON or missing required sections

## Green

- implement the smallest Bun-based config loader and CLI dispatch needed to pass

## Refactor

- extract config validation into a dedicated module

## Review Focus

- public CLI shape
- config error ergonomics
- Bun setup stays minimal and reviewable
