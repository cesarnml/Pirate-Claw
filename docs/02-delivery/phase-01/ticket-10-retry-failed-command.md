# P1.10 Retry-Failed Command

Size: 2 points

## Outcome

- retry only previously failed candidates that still have enough stored data for submission

## Red

- write tests proving failed items are retried and queued items are not retried

## Green

- implement retry logic using stored candidate data

## Refactor

- share submission-path code with `run` where behavior remains explicit

## Review Focus

- retry boundaries
- no duplicate queueing
