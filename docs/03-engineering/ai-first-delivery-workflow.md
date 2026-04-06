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
- artifact and note persistence
- notification hooks

The repo-local `ai-code-review` skill owns the judgment:

- what counts as AI review
- which comments are actionable
- which comments should be rejected as stale, weak, or out of scope

The boundary is implemented as repo-local hooks under `.agents/skills/ai-code-review/`: a fetcher that normalizes supported external AI review into structured data, and a triager hook that turns that data into a final outcome plus concise rationale.

Supported external review agents are currently:

- `coderabbit`
- `qodo`
- `greptile`

Other AI-review vendors are out of scope unless repo policy explicitly adds them.

The normalized artifact now carries reviewed-commit provenance and native GitHub inline-thread identity when available. That lets the PR body distinguish current-head review from stale-history review, and it lets patched inline findings be resolved in the GitHub PR UI without vendor-specific logic.

That boundary matters. AI is used aggressively, but not blindly.

There is also a Telegram notifier for long-running flow milestones. It can send concise updates when a PR opens, when AI review starts, and when review is recorded.

Current repo entry points:

- ticket-linked flow: [`docs/03-engineering/delivery-orchestrator.md`](./delivery-orchestrator.md)
- repo-local skill: [`../../.agents/skills/ai-code-review/SKILL.md`](../../.agents/skills/ai-code-review/SKILL.md)

This is designed to become template-ready repo infrastructure, not a one-off Pirate Claw trick.
