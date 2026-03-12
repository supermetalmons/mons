# Events Flow

This document is the current reference for the pilot `events` feature.

It describes:

- what is implemented right now
- how event creation/join/start/progression work
- which backend pieces are involved
- which deploy command is needed for just the event rollout

---

## 1) Product Intent

`events` are small single-elimination tournaments.

Current pilot rules:

- only users `ivan`, `meinong`, `obi`, `bosch`, `monsol`, and `bosch2` can create events
- any signed-in non-anon user can join before the event starts
- event matches are rated
- event matches are single-game only
- rematches are disabled for event-owned games

Event links use:

- `/event/<id>`

Opening an event link:

- boots the normal home-board session
- immediately opens the event modal on top

Closing the modal from an `/event/<id>` route:

- returns the user to `/`

---

## 2) User Flow

## 2.1 Create

Creation is exposed only in the experimental menu, and only when:

- `storage.getUsername("").trim().toLowerCase()` is one of `ivan`, `meinong`, `obi`, `bosch`, `monsol`, `bosch2`

Create input:

- minutes from now, minimum `1` minute

On success:

- backend creates a bare 11-char event id
- creator is auto-enrolled as the first participant
- app transitions to `/event/<id>`
- event modal opens immediately

## 2.2 Join

Join is allowed only if:

- the event is still `scheduled`
- current time is still before `startAtMs`
- the player has a non-empty profile id

If an anon user taps `Join`:

- event modal stays open
- inline message asks them to sign in
- sign-in popup opens automatically
- after successful sign-in, join is retried once while the event modal remains open

## 2.3 Start

There is no separate scheduler right now.

Start/advance is handled by the callable:

- `syncEventState`

It is triggered best-effort from the client:

- when event modal opens
- when a scheduled event reaches `startAtMs` while modal is open
- after an event match rating update runs

At `startAtMs`:

- if at least 2 participants exist, round 1 is created
- if fewer than 2 participants exist, event becomes final-status `dismissed`

## 2.4 Bracket progression

Bracket format:

- progressive single elimination
- each round shuffles remaining players
- adjacent players are paired
- if count is odd, exactly one player gets a bye

Round 1 bye preference:

- if any participant matches `obi`, `meinong`, `ivan`, `bosch`, or `monsol` by username/display name, one of them is chosen from randomized order
- otherwise a random participant gets the bye

Later rounds:

- odd-player bye is random only

When all matches in the current round resolve:

- `syncEventState` marks winners/losers
- either creates the next round
- or ends the event with a final winner

---

## 3) Event Modal

The event modal is global UI mounted near app root.

Current behavior:

- works over home board
- works over live game boards
- always shows copy-link button
- shows event date header and relative subtitle
- shows participant list
- shows round-by-round bracket once active

Footer states:

- not joined + scheduled: `Join` and `Skip`
- joined + scheduled: disabled `Play` with note
- active + current match available: enabled `Play`
- active + bye / already advanced: disabled `Play Next`
- eliminated: no play button

Match card behavior:

- your active event game is highlighted
- tapping your game closes modal and opens that game
- tapping other event games opens them for spectating unless you are one of the players

---

## 4) In-Game Integration

Event-created matches are marked on the invite with:

- `eventId`
- `eventRoundIndex`
- `eventMatchKey`
- `eventOwned: true`

Current event-owned game behavior:

- bottom controls show an extra event button near Home
- tapping that button reopens the event modal
- rematch UI is suppressed
- end-of-match flow still performs rating update
- after rating update, client best-effort calls `syncEventState`

---

## 5) Navigation Integration

Participants get a projected navigation row in Firestore at:

- `users/{profileId}/games/event_<eventId>`

Navigation row behavior:

- appears among waiting / active / ended rows based on event state
- shows a small participant avatar preview plus `+N` when needed
- shows formatted start date
- opens the event modal when selected

Event rows are projected only for enrolled participants.

---

## 6) Backend Pieces

Primary files:

- `cloud/functions/events.js`
- `cloud/functions/eventProjector.js`
- `cloud/functions/matchOutcome.js`

Callable functions:

- `createEvent`
- `joinEvent`
- `syncEventState`

Other redeployed functions:

- `updateRatings`
- `projectProfileGamesOnInviteMatchRatingUpdated`

Why they matter:

- it now shares the extracted match-outcome helper and also triggers best-effort event sync after event matches
- the invite projector now flips event-owned game rows from `active` to `ended` when the rating-update flag is written

RTDB source-of-truth paths:

- `events/{eventId}`
- `eventLocks/{eventId}`
- standard invite + player match paths for generated event games

Firestore projection path:

- `users/{profileId}/games/event_<eventId>`

Rules changed:

- Realtime Database rules only

---

## 7) Current Deploy Command

From repo root, deploy only the event-related functions plus RTDB rules:

```bash
cd /Users/ivan/Developer/mons/link/cloud && firebase deploy --only functions:createEvent,functions:joinEvent,functions:syncEventState,functions:projectProfileGamesOnEventWritten,functions:projectProfileGamesOnInviteMatchRatingUpdated,functions:updateRatings,database --project mons-link
```

This intentionally avoids redeploying unrelated functions and avoids Firestore rules/indexes.

---

## 8) Current Limitations

Known pilot limitations right now:

- start/advance is best-effort callable-driven, not cron-driven
- no dedicated automated tests were added yet for event helpers
- event projection exists only for participants, not arbitrary spectators
