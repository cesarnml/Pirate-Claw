# V2 ideation — Transmission observer sidecar

Current stance: do not add this yet.

Pirate Claw's state freshness is already reasonably strong. In the current
shape, Transmission-vs-Pirate-Claw reconciliation is at most about 30 seconds
behind real time, which is good enough for the current product surface. That is
not the place to spend complexity right now.

The sidecar idea is still the right **v2 boundary** if real-time-ish behavior
becomes important.

Recommended split for a future version:

- a dedicated sidecar short-polls Transmission aggressively
- the sidecar emits events only when something materially changes
- Pirate Claw consumes those events idempotently
- Pirate Claw keeps the slower reconciliation loop as a sanity fallback and
  drift repair path

Why this is the right v2 shape:

- it removes hot-loop observation from Pirate Claw
- it separates "what changed in Transmission?" from "what should Pirate Claw do
  about it?"
- it gives a cleaner home for noisy progress observation and edge-triggered
  transitions without pushing more polling semantics into the main daemon

Suggested v1-for-v2 event contract:

- emit transitions, not raw polls
- include stable keys: `hash`, `status`, `percentDone`, `uploadedEver`,
  `doneDate`, `observedAt`
- include a dedupe-safe event identity or deterministic idempotency key
- keep a heartbeat plus replay window or persisted last-seen snapshot so restart
  gaps do not silently lose transitions

Likely useful event types:

- `torrent_progressed`
- `torrent_completed`
- `torrent_missing`
- `torrent_removed`
- `observer_heartbeat`

Important boundary rule:

The sidecar should report observed Transmission facts. Pirate Claw should remain
the policy engine and the owner of higher-level semantics such as
`missing_from_transmission`, sticky completed behavior, and any recovery or
requeue decisions.

Why not now:

- another process to deploy and supervise
- another contract to version
- ordering, replay, and restart semantics to get right
- current 30-second freshness does not justify that operational cost yet

Trigger for revisiting this note:

Re-open the sidecar path if Pirate Claw needs meaningfully faster reaction time
than the current reconciliation window can provide, or if polling pressure and
state-observation complexity start dominating the main daemon design.
