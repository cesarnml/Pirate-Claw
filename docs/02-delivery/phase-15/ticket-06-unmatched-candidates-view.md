# P15.06 Unmatched Candidates View

## Goal

Add a read-only Unmatched Candidates view at `/candidates/unmatched` sourced from `GET /api/outcomes?status=skipped_no_match`. Operators use this to diagnose why feed items were not picked up by any policy.

## Prerequisites

- P15.01 (`GET /api/outcomes` endpoint) merged
- `fixtures/api/outcomes-skipped-no-match.json` committed

## Scope

### New Route: `web/src/routes/candidates/unmatched/`

Create:

- `+page.server.ts`
- `+page.svelte`
- `unmatched.test.ts`

**`+page.server.ts`**:

```typescript
import { apiFetch } from '$lib/server/api';
import type { SkippedOutcomeRecord } from '$lib/types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  try {
    const data = await apiFetch<{ outcomes: SkippedOutcomeRecord[] }>(
      '/api/outcomes?status=skipped_no_match',
    );
    return { outcomes: data.outcomes, error: null };
  } catch {
    return {
      outcomes: [] as SkippedOutcomeRecord[],
      error: 'Could not reach the API.',
    };
  }
};
```

**`+page.svelte`**:

- Heading: "Unmatched Candidates"
- Subheading: "Feed items from the last 30 days that matched no policy rule."
- Client-side title search: `<input>` filters `outcomes` by `title` (case-insensitive contains). Reactive with `$state()`.
- Read-only table: title | feed | run id | recorded at
  - `title`: render "—" when null
  - `feedName`: render "—" when null
  - `runId`: plain number
  - `recordedAt`: formatted date (same `formatDate` utility as dashboard)
- "No unmatched candidates in the last 30 days." empty state
- Error alert when `error` is set
- No action buttons — this is a diagnostic view

### `web/src/lib/types.ts`

Add:

```typescript
export type SkippedOutcomeRecord = {
  id: number;
  runId: number;
  status: 'skipped_no_match';
  recordedAt: string;
  title: string | null;
  feedName: string | null;
};
```

### Navigation

Add "Unmatched" link to the navigation in `web/src/routes/+layout.svelte` under Candidates (or as a sibling nav item). Match the existing nav link style.

### `web/src/routes/candidates/unmatched/unmatched.test.ts`

Tests anchored to `fixtures/api/outcomes-skipped-no-match.json`:

- Renders table with correct columns
- Null title/feedName renders as "—"
- Title search filters rows by partial match (case-insensitive)
- Title search with no match shows empty table body (not the empty-state placeholder)
- Empty outcomes → renders "No unmatched candidates" placeholder
- Error state → renders alert

## Out of Scope

- Pagination
- Server-side search
- Action buttons (re-run, flag for review)
- Filtering by feed, run id, or date range

## Exit Condition

`/candidates/unmatched` is reachable from the nav, shows the outcomes table with client-side search, and handles null title/feedName gracefully. Tests are green anchored to the fixture snapshot.

## Rationale

_(Update this section after implementation with any behavior or tradeoff changes discovered.)_
