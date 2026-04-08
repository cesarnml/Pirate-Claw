# EE4.04 — PR Body Metadata Polish

## Goal

Three small cosmetic improvements to the PR body that make metadata lines more useful to a reviewer without any data model changes.

## Changes

### 1. Ticket file → GitHub permalink

**Current:**

```
- ticket file: docs/02-delivery/phase-10/ticket-02-candidates-list.md
```

**Target:**

```
- ticket file: [docs/02-delivery/phase-10/ticket-02-candidates-list.md](https://github.com/{owner}/{repo}/blob/main/docs/02-delivery/phase-10/ticket-02-candidates-list.md)
```

The link targets `main` (not a SHA) — ticket docs don't move after a phase starts, and `main` links remain human-readable after stacks close.

### 2. Reviewed / head commit SHAs → clickable commit links

**Current:**

```
- reviewed commit: `5701efe6c1d7`
- current branch head: `6d88b81ab5dd`
```

**Target:**

```
- reviewed commit: [`5701efe6c1d7`](https://github.com/{owner}/{repo}/commit/5701efe6c1d7...)
- current branch head: [`6d88b81ab5dd`](https://github.com/{owner}/{repo}/commit/6d88b81ab5dd...)
```

Full SHA in the URL, shortened display label. Reviewer can one-click to the commit or construct a comparison URL.

### 3. ISO timestamp → human-readable

**Current:**

```
- post-verify self-audit: completed at 2026-04-08T00:01:49.533Z
```

**Target:**

```
- post-verify self-audit: completed at 2026-04-08 00:01 UTC
```

Drop milliseconds, drop the `T`/`Z` ISO separators, keep UTC suffix.

## Change Surface

- `tools/delivery/pr-metadata.ts` — Summary section builder (ticket file line) and review status section (SHA lines, timestamp line)
- Repo remote URL (owner/repo) needed for permalink and SHA links — derive from `gh repo view --json owner,name` or pass as context already available in the orchestrator
- `tools/delivery/orchestrator.test.ts` — update any snapshot assertions that include these lines

## Acceptance Criteria

- [x] `bun run verify && bun run test` pass
- [x] Ticket file line renders as a Markdown link targeting `https://github.com/{owner}/{repo}/blob/main/{path}`
- [x] `reviewed commit` and `current branch head` lines render as Markdown links targeting the full commit SHA URL
- [x] `post-verify self-audit: completed at` line uses `YYYY-MM-DD HH:mm UTC` format, no milliseconds
- [x] No change to any other PR body section

## Rationale

`resolveGitHubRepo` reads `nameWithOwner` via `gh repo view` at orchestrator call sites (`updatePullRequestBody`, `openPullRequest`, `restack`, standalone refresh) and passes `githubRepo` into `buildPullRequestBody` / `buildExternalAiReviewSection` so render functions stay pure and never call `gh` inside the markdown builders.

## Notes

- If owner/repo is not already in scope at render time, add it as an optional field on the relevant render input type — do not call `gh` at render time (render is pure).
- The owner/repo should be derived once at orchestrator call time and threaded through, similar to how `currentHeadSha` is already threaded.
- Markdown links in GitHub PR bodies render as clickable hyperlinks — no special formatting needed beyond standard `[label](url)` syntax.
