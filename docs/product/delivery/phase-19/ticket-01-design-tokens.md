# P19.01 Design tokens + onboarding retouch

## Goal

Replace the current `oklch`-based design tokens in `web/src/app.css` with the
Obsidian Tide palette and verify the token changes propagate correctly across
the existing UI — including a targeted retouch of the onboarding wizard to fix
any hardcoded color or layout values that won't inherit the new CSS variables.

## Scope

- **`web/src/app.css`:** Replace all CSS custom properties with the Obsidian
  Tide token set:

  | Token            | Value     | Role                                             |
  | ---------------- | --------- | ------------------------------------------------ |
  | Background       | `#0F172A` | Page and sidebar background                      |
  | Card / surface   | `#1E293B` | Cards, panels, table rows                        |
  | Border           | `#334155` | Dividers, input outlines                         |
  | Primary accent   | `#14B8A6` | Interactive elements, active nav, progress bars  |
  | Secondary accent | `#10ECE8` | Highlights, active states, completion indicators |
  | Tertiary accent  | `#0DBAF9` | Info chips, tertiary badges                      |
  | Destructive      | `#EF4444` | Error states, failure chips                      |
  | Warning          | `#F59E0B` | Warning chips, WANTED / MISSING states           |
  | Text primary     | `#F1F5F9` | Headings, labels                                 |
  | Text muted       | `#94A3B8` | Secondary metadata, timestamps                   |

- **shadcn-svelte component audit:** scan `web/src/lib/components/ui/` for
  hardcoded color values that bypass CSS variables; patch any found so they
  inherit the new tokens
- **`web/src/routes/onboarding/+page.svelte`:** apply a token retouch pass —
  replace any hardcoded colors or layout classes that conflict with the new
  palette; no structural changes to the wizard flow

## Out Of Scope

- Sidebar layout or navigation restructure (P19.02)
- Any route-level view redesign (P19.03–P19.07)
- New components of any kind

## Exit Condition

The app renders with the Obsidian Tide color palette on all existing routes.
No hardcoded color values remain in the shadcn-svelte base components that
visually conflict with the new tokens. The onboarding wizard loads without
visual regressions against the new palette. All existing functionality
(navigation, config writes, toast notifications) continues to work.

## Rationale

Landing tokens in isolation gives a reviewable CSS-only PR with zero behavior
risk. It establishes a visual baseline the subsequent layout and view tickets can
build on, and keeps palette corrections out of structurally complex diffs.
