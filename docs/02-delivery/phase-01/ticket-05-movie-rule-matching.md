# P1.05 Movie Policy Filtering

Size: 2 points

## Outcome

- match movie items by allowed release year policy
- enforce codec and resolution filters
- rely on release identity, not movie name intent, for duplicate prevention assumptions

## Red

- write tests for year-policy acceptance
- write tests for codec and resolution rejection
- write tests that movie matching does not require a title pattern

## Green

- implement the movie policy filter

## Refactor

- share filter logic with TV matching where it stays behavior-safe

## Review Focus

- clear difference between TV rule semantics and movie policy semantics
