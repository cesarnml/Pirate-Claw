# Repo Rules

- If the user says `triage`, use `.agents/skills/ai-code-review/SKILL.md`.
- For phase work, read `docs/00-overview/start-here.md` and `docs/03-engineering/delivery-orchestrator.md` first, then surface the orchestrator path before coding.
- Use `.agents/skills/son-of-anton-ethos/SKILL.md` automatically when executing any approved multi-ticket phase/epic or standalone (non-ticketed) PR — including when the user says execute, begin, start, deliver, implement, continue, resume, run, drive, carry, work on, or explicitly mentions `son of anton` / `son-of-anton ethos`. That skill owns execution mechanics, stop conditions, polling, and review outcome recording.
- For new product feature-set expansion, phase shaping, or epic decomposition: run a planning pass and use `grill-me` before accepting any plan. Developer approval of ticket decomposition is required before implementation.
- Prefer `bun run deliver --plan ...` over ad hoc implementation. The delivery orchestrator reads `orchestrator.config.json` at repo root; see `docs/03-engineering/delivery-orchestrator.md`. For orchestrated ticket work, the handoff under `.agents/delivery/<plan-key>/handoffs/` is required input alongside plan and ticket docs.
- New product phase/epic starts only after developer-approved ticket decomposition. Docs-only, cleanup-only, and tooling-only changes skip this. Smaller bounded changes may ship as standalone PRs using the orchestrator's `ai-review` path.
- Final merge of stacked PR slices requires developer approval. Close completed phases with `bun run closeout-stack --plan <plan-path>`.
- PR titles: Conventional-Commit-style subject + active ticket suffix (e.g. `[P3.02]`) when the ticket is clear from branch/docs/diff. Apply even when the user did not type `pr`.

## Tailwind CSS

Prefer canonical scale classes over arbitrary values. Use `min-w-112.5` not `min-w-[450px]`. Bracket syntax only when no canonical equivalent exists.

## Pre-Commit

Before committing: run `bun run format` for touched files (for `web/` also `bun run format:web`; or `bun run verify` covers both). Run `bun run spellcheck` when docs, Markdown, config examples, PR text, or user-facing copy changed.

## Ticket Completion Checklist

Before closing a delivery ticket:

- Add/update `## Rationale` in the ticket doc when behavior or trade-offs changed; append later findings there — not in PR bodies or chat.
- Check `README.md` when user-visible behavior, commands, or project status changed.
- Check `docs/00-overview/start-here.md` when delivered scope, commands, status, or deferrals changed.
- Check `docs/00-overview/roadmap.md` when delivered scope, status, active phase, notes, or deferrals changed.
- Check `docs/README.md` when a new phase plan, delivery doc, or durable doc path was added.
- Verify the relevant tests or checks for the completed work.

## On Phase or Epic Completion

Write `notes/public/<plan-path>-retrospective.md` using `.agents/skills/write-retrospective/SKILL.md` for section structure and placement conventions.
