# P16.08 Collapsible Cards and Read-Only Audit

## Goal

Wrap each config section card in a Shadcn/UI Accordion item so sections are collapsible. Audit and verify read-only mode (disabled controls + tooltips when `apiWriteToken` is absent) is correct across all cards after the P16.03–P16.07 changes.

## Scope

### Accordion wrapping — `+page.svelte`

- Import `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` from `$lib/components/ui/accordion`.
- Wrap the top-level cards `<div class="mt-8 space-y-6">` in a single `<Accordion type="multiple">` so any subset of sections can be open simultaneously.
- Each card becomes an `<AccordionItem value="<section-id>">`:
  - `value` identifiers: `"transmission"`, `"feeds"`, `"tv-configuration"`, `"movie-policy"`, `"runtime"`, `"tv-shows"`.
  - `<AccordionTrigger>`: section heading (e.g., "Transmission", "RSS Feeds").
  - `<AccordionContent>`: existing `<CardContent>`.
- Default open state: open all sections on first render (`defaultValue={["transmission","feeds","tv-configuration","movie-policy","runtime","tv-shows"]}`). Operator can collapse sections they're not actively editing.
- The `<form>` tags that wrap card content must remain outside `<AccordionContent>` if the accordion collapses DOM nodes — or inside, but verify that `use:enhance` bindings survive Svelte's conditional rendering. If the form needs to be always-mounted for `enhance` to work, use CSS `hidden` via the accordion's open state rather than DOM removal.

### Read-only audit

Walk every interactive control across all cards and verify:

- When `canWrite` is `false`: all inputs, selects, chip toggle buttons, and submit buttons are `disabled`.
- Each disabled control or its container has `title={WRITE_DISABLED_TOOLTIP}` set to `"Configure PIRATE_CLAW_API_WRITE_TOKEN to enable editing"`.
- No site-wide banner is shown — tooltip on the control is the only affordance.
- Exception: "Test Connection" button on the Transmission card is **not** disabled in read-only mode (it's a read operation, not a write).
- Exception: The "Restart Daemon" button requires the write token (the `restartDaemon` action checks it) — disable it with the same tooltip if `!canWrite`.

Produce a checklist in the ticket rationale section of the PR (not in this spec) covering each control that was audited.

### Tests

- Snapshot or selector test: in read-only mode (`canWrite = false`), all form submit buttons are disabled.
- Accordion render: all six accordion items are present in the DOM on load.

## Out of Scope

- Any save logic changes — all save actions are finalized by P16.07.
- Toast system changes — finalized by P16.02.

## Exit Condition

All cards are collapsible via Accordion. Read-only mode is verified across all sections. No regression in any existing save flow. Tests green.

## Rationale

This ticket comes last among the UI tickets because wrapping forms in an Accordion requires understanding the final form structure. Doing it before the form split (P16.07) would mean re-wrapping after the split.

The read-only audit is colocated here because it's a holistic check that only makes sense after all card changes are complete. Running it per-card would either miss cross-card inconsistencies or duplicate effort in each ticket.
