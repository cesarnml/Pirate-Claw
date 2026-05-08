# `P3.04` Rationale

- red first: after `P3.03`, a torrent that had fully completed and later disappeared looked indistinguishable from a torrent that vanished before completion
- chosen path: make `completed` sticky once observed, persist `missing_from_transmission` only for tracked torrents that disappear before any completed observation, and let both reconcile output and status reflect that rule
- alternative rejected: trying to infer operator intent from a missing torrent would overreach the local CLI boundary and pretend to know whether a removal was manual
- deferred: seeding policy, media placement, and any recovery workflow for missing torrents remain outside Phase 03
