# P1.04 TV Rule Matching

Size: 2 points

## Outcome

- match normalized TV items against regex-based rules
- enforce codec and resolution filters

## Red

- write tests that prove intended titles match and near-misses do not
- prove case-insensitive regex behavior

## Green

- implement the TV matcher

## Refactor

- make scoring and rule evaluation readable

## Review Focus

- fuzzy matching without unsafe overmatch
