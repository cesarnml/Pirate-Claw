# `P5.02 Add Transmission Label Routing With Fallback`

## Goal

Submit torrents with media-type labels to Transmission at queue time, with an automatic fallback to label-free submission when labels are unsupported.

## Why This Ticket Exists

Transmission supports optional labels/categories that drive downloader-side placement rules. Pirate Claw can pass `movie` or `tv` at queue time without owning final media placement, letting the operator configure Transmission rules independently. When the Transmission version does not support labels, the submission must still succeed.

## Scope

- pass a `labels` argument (`["movie"]` or `["tv"]`) in the Transmission `torrent-add` RPC call based on the media type of the matched item
- if Transmission responds with an error that indicates the argument is unsupported, log a warning and retry the same torrent without the `labels` argument
- if the fallback submission succeeds, treat the queue outcome as successful and record it normally
- if both attempts fail, surface the error as before
- add tests covering labeled submission success, unsupported-label fallback, and double-failure error propagation

## Out Of Scope

- per-feed custom label values
- hard-fail mode when labels are unsupported
- using labels to infer or drive media placement inside Pirate Claw
- codec policy changes (P5.01)

## Rationale

The fallback path is the key design constraint. Transmission's RPC response for unsupported arguments is a distinct error class; the adapter detects it and retries without the labels field rather than failing the whole queue operation. This keeps the pipeline compatible with older or restricted Transmission installations without operator-side config changes.

Label values are fixed as `movie` and `tv` in this ticket. Per-feed custom labels are a deferred generalization.

## Red First Prompt

What user-visible behavior fails first when a Transmission instance that rejects label arguments receives a labeled `torrent-add` request and no fallback retry exists?
