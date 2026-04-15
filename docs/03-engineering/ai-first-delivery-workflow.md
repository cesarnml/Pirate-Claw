# AI-First Delivery Workflow

This repo includes a repo-local delivery orchestrator for AI-first development work.

The point is simple: move fast without losing control of the codebase.

It does that by keeping work in thin, reviewable slices:

- start a scoped ticket or PR flow
- open or update the PR with consistent metadata
- poll for AI review comments on a fixed cadence
- record or patch prudent findings
- keep the PR body current with what happened

It can also carry a larger feature through several small linked PRs, so you can ship step by step without losing the thread of the overall implementation.

The orchestrator owns the mechanics:

- branch and worktree flow
- PR open/update behavior
- AI review polling
- review-artifact and note persistence
- notification hooks

The repo-local `ai-code-review` skill owns the judgment:

- what counts as AI review
- which comments are actionable
- which comments should be rejected as stale, weak, or out of scope

The boundary is implemented as repo-local hooks under `.agents/skills/ai-code-review/`: a fetcher that normalizes supported external AI review into structured data, and a triager hook that turns that data into a final outcome plus concise rationale.

The persisted review contract is split on purpose:

- `reviews/<ticket>.fetch.json` stores normalized vendor evidence
- `reviews/<ticket>.triage.json` stores repo-local judgment and triage side effects
- `state.json` only indexes those artifacts plus compact review status fields

Supported external review agents are currently:

- `coderabbit`
- `qodo`
- `greptile`
- `sonarqube`

Other AI-review vendors are out of scope unless repo policy explicitly adds them.

SonarQube support uses GitHub check annotations instead of native PR review comments. The standalone `ai-review` flow normalizes only failed-check annotations into the fetch artifact so triage stays focused on higher-signal static-analysis findings such as complexity/code-smell failures instead of importing the full warning stream.

The normalized fetch artifact carries reviewed-commit provenance and native GitHub inline-thread identity when available. The paired triage artifact records the repo judgment and any follow-through such as thread resolution or PR-body refresh attempts. Together they let the PR body distinguish current-head review from stale-history review and let patched inline findings be resolved in the GitHub PR UI without vendor-specific logic.

That boundary matters. AI is used aggressively, but not blindly.

There is also a Telegram notifier for long-running flow milestones. It can send concise updates when a PR opens, when AI review starts, and when review is recorded.

Current repo entry points:

- ticket-linked flow: [`docs/03-engineering/delivery-orchestrator.md`](./delivery-orchestrator.md)
- repo-local skill: [`../../.agents/skills/ai-code-review/SKILL.md`](../../.agents/skills/ai-code-review/SKILL.md)

This is designed to become template-ready repo infrastructure, not a one-off Pirate Claw trick.
