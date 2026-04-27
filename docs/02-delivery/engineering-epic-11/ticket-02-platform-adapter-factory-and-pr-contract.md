# EE11.02 — Platform Adapter Factory And PR Contract

## Goal

Convert platform adapter wrappers from singleton-backed named functions into a
factory-created adapter object. Improve the PR creation contract so callers no
longer parse PR numbers from URLs.

## Current Behavior

`platform-adapters.ts` exports named functions that read `_config.runtime` and
`_config.packageManager` directly. `createPullRequest` returns a PR URL string.
`parsePullRequestNumber` lives in `platform-adapters.ts` but is passed into
ticket-flow wiring so caller-side code can recover the PR number from the URL.

## Target Behavior

`platform-adapters.ts` exports:

```ts
createPlatformAdapters(config): PlatformAdapters
```

Adapter methods close over config-derived runtime values. `createPullRequest`
returns:

```ts
{
  url: string;
  number: number;
}
```

The PR number parsing detail stays inside the platform adapter boundary and is
not passed as a dependency to ticket-flow code.

## Change Surface

- `tools/delivery/platform-adapters.ts`
- `tools/delivery/platform.ts` only if raw platform contracts need a type alias
- `tools/delivery/ticket-flow.ts`
- `tools/delivery/cli-runner.ts` call sites that consume platform adapters
- `tools/delivery/test/ticket-flow.test.ts`
- `tools/delivery/test/orchestrator.test.ts` or focused adapter tests

## Acceptance Criteria

- [ ] `createPlatformAdapters(config)` exists
- [ ] `PlatformAdapters` type exists and exposes the existing adapter surface
- [ ] Adapter methods no longer read `_config`
- [ ] Adapter methods close over `config.runtime` and `config.packageManager`
- [ ] `createPullRequest` returns `{ url, number }`
- [ ] `parsePullRequestNumber` is no longer a ticket-flow dependency
- [ ] PR number parsing remains covered inside adapter tests or through the
      existing open-PR behavior tests
- [ ] Existing delivery behavior remains unchanged
- [ ] `bun test` passes

## Tests

Update open-PR and ticket-flow tests for the richer `createPullRequest` return
value. Add a focused test for PR URL parsing if no existing behavior test covers
the adapter-side parse.

## Rationale

Red first:

Why this path:

Alternative considered:

Deferred:
