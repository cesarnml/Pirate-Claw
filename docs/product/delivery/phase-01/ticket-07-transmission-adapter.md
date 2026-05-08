# P1.07 Transmission Adapter

Size: 2 points

## Outcome

- submit a candidate to Transmission over RPC
- handle session-id negotiation
- surface success or failure in a structured way

## Red

- write tests against a fake local Transmission-like server
- prove both handshake and error recording behavior

## Green

- implement the adapter

## Refactor

- keep the adapter behind a narrow downloader interface

## Review Focus

- boundary design
- failure handling
