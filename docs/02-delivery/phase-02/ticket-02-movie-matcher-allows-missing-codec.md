# P2.02 Movie Matcher Allows Missing Codec

Size: 2 points

## Outcome

- allow movie items to match when year and resolution are valid even if codec is absent
- keep explicit disallowed codecs rejected
- rank explicit allowed codec hits above otherwise equivalent unknown-codec candidates

## Red

- add movie matcher tests for YTS-style titles that include year and resolution but no codec token
- prove explicit allowed codec beats missing codec when duplicate movie candidates compete for the same identity
- prove explicit disallowed codec still rejects the item

## Green

- adjust movie matching so codec is optional only when it is absent from the parsed title

## Refactor

- keep the config schema unchanged for this ticket
- isolate any scoring change so TV matching semantics do not drift

## Review Focus

- minimal change to movie policy semantics
- duplicate ranking remains predictable when metadata richness differs between candidates
