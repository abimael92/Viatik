# Feature: Expanded transit modes and lodging-only reservations

**Status:** Implemented

## Scope

- Transit supports plane, train, car, carpool, taxi, Uber/rideshare, bus, ship, ferry, bike, and walking.
- Transit uses a dedicated mode dropdown and journey fields for origin, destination, departure, arrival, and estimated travel duration.
- Ticket scanning is shown only for ticket-oriented modes.
- Lodging activities expose reservation logging for a house, hotel, motel, Airbnb, or similar stay.
- Transit no longer exposes lodging reservation logging.

## Invariants

- A transit leg is represented as travel between an origin and destination with schedule data.
- Travel duration is derived from departure and arrival times, including overnight journeys.
- Lodging reservation references are captured only by lodging activities.
- Existing transit storage remains backward-compatible with flight and train records.

## Verification

- Activity form and transit repository/service tests pass.
- Lint, typecheck, build, and whitespace checks pass.
