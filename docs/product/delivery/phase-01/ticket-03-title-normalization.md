# P1.03 Title Normalization

Size: 2 points

## Outcome

- normalize raw titles into metadata needed by matching
- extract season/episode, year, resolution, and codec

## Red

- write table-driven tests against representative noisy titles
- prove both TV and movie shapes are extracted correctly

## Green

- implement the smallest normalization rules to pass the examples

## Refactor

- centralize regex helpers and normalization utilities

## Review Focus

- correctness of extracted metadata
- behavior on partially missing metadata
