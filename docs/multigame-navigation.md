# Multi-Game Navigation

## 1) Purpose

This document is now the canonical guide for multi-game navigation:
- why this exists
- what was implemented
- how the system works end-to-end
- how to deploy, backfill, and launch safely
- what should come next

The old planning docs (`plan.md`, `plan_implementation.md`) were consolidated here.

---

## 2) Product Intent

The core goal is unchanged:
- let a player open navigation and quickly see/reopen their games
- keep RTDB as gameplay source of truth
- add a read-optimized list model without changing runtime match recovery semantics

Key UX intent:
- active games above ended games
- include both direct-link and automatch games
- pending automatch appears immediately and disappears correctly when canceled
- row click always opens `/{inviteId}` and existing runtime logic resolves game/match state

---

## 3) Current Architecture (Implemented)

## 3.1 Write model remains RTDB-first
- invites/rematches/matches continue to live in RTDB
- gameplay sync and move flow are unchanged

## 3.2 Read model in Firestore
- path: `users/{profileId}/games/{inviteId}`
- one row per invite series
- Firestore is a projection/read model, not gameplay truth

## 3.3 Projector and triggers
- module: `cloud/functions/profileGamesProjector.js`
- shared recompute entry: `recomputeInviteProjection(inviteId, reason, options)`
- narrow trigger set:
  - invite created
  - invite guestId changed
  - invite hostRematches changed
  - invite guestRematches changed
  - match created (`/players/{loginUid}/matches/{matchId}`)
  - automatch queue written (`/automatch/{inviteId}`)
  - profile link created (`/players/{loginUid}/profile`)

Why this shape:
- avoids reaction/wager churn triggers
- keeps a single deterministic recompute path
- avoids per-move write amplification

## 3.4 Queue-based pending automatch semantics
- pending only while queue entry exists at `automatch/{inviteId}`
- if queue removed and no guest joined, row is removed
- if guest joined, row persists as normal game
- invite marker fields are maintained for fallback clients:
  - `automatchStateHint: "pending" | "matched" | "canceled"`
  - `automatchCanceledAt: number | null`

## 3.5 Identity/link preservation
- profile-link trigger on `/players/{loginUid}/profile` runs catch-up projection over that login’s historical matches
- bounded by:
  - max invites per invocation
  - bounded concurrency
  - timeout guard
- logs structured completion/incomplete status for admin reruns

## 3.6 Match ID resolver behavior
- exact invite ID is accepted
- otherwise tries candidate prefixes derived from rematch suffixes
- if multiple valid candidates exist, resolver now rejects as ambiguous (no guessing)

---

## 4) Firestore Game Row Shape (Current)

Rows include fields used by current UI plus additive compatibility fields for future work.

Core fields currently written:
- `inviteId`
- `kind: "auto" | "direct"`
- `status: "pending" | "waiting" | "active" | "ended"`
- `sortBucket`
- `listSortAt`
- `createdAt`
- `updatedAt`
- `endedAt`
- `isPendingAutomatch`
- `hostLoginId`
- `guestLoginId`
- `hostProfileId`
- `guestProfileId`
- `ownerProfileId`
- `opponentProfileId`
- `opponentName`
- `opponentEmoji`
- `automatchStateHint`
- `automatchCanceledAt`
- `latestMatchId`
- `lastEventFingerprint`
- `lastEventType`
- `lastEventReason`
- `lastEventAt`

Additive compatibility fields (for future schema standardization):
- `entityType: "game"`
- `projectorVersion`
- `source: "rtdb-projector"`
- `ownerRole: "host" | "guest"`
- `ownerLoginId`
- `opponentLoginId`
- `opponentDisplayName` (mirror of `opponentName`)
- `opponentEmojiId` (mirror of `opponentEmoji`)

Notes:
- UI currently routes by invite only and does not depend on `latestMatchId`
- client mapping supports both `opponentName/opponentEmoji` and `opponentDisplayName/opponentEmojiId`

---

## 5) Sorting and Projection Rules

Current buckets:
- `20` active
- `30` pending automatch
- `40` waiting
- `50` ended

Query order:
- `sortBucket asc`
- `listSortAt desc`

Write suppression:
- if computed fingerprint matches stored `lastEventFingerprint`, skip write
- this prevents duplicate-trigger recency churn

Backfill recency policy:
- backfill may provide low baseline `listSortAt`
- projector keeps fresher existing `listSortAt` when `preserveNewerListSortAt` is true

---

## 6) Frontend Behavior (Current)

## 6.1 Data loading strategy
- navigation popup subscribes to Firestore profile list when profile id exists
- if Firestore list subscription errors, it falls back to current-login RTDB aggregation
- if user has no profile id, uses fallback directly
- fallback scope is explicitly labeled in UI: “Showing games for current login only”

## 6.2 Optimistic automatch row
- `automatch` callable now returns:
  - `mode: "pending" | "matched"`
  - `matchedImmediately: boolean`
- client creates optimistic pending row only when `mode === "pending"`
- row is removed when projected row arrives or automatch cancel succeeds

## 6.3 Popup content ordering (current)
- top learn section if tutorial incomplete
- games section
- quick actions section (`Automatch`, `Direct Link`, `Bot Game`) when available
- learn section (full list) remains available for completed users

---

## 7) Security and Indexing

Firestore rules:
- `/users/{userId}/games/{inviteId}` is read-only to authenticated owners by login membership (`logins.hasAll([request.auth.uid])`)
- client writes denied

Indexes:
- collection group `games` composite:
  - `sortBucket ASC`
  - `listSortAt DESC`

---

## 8) Backfill Tool

Script:
- `cloud/admin/backfillProfileGamesFirestore.js`

Characteristics:
- idempotent through shared recompute
- supports dry run
- supports bounded target ranges
- paginates invite key scanning (does not load entire invite tree in one read)
- preserves fresher live recency fields

CLI options:
- `--project <projectId>`
- `--dry-run`
- `--limit <n>`
- `--since-key <inviteId>`
- `--list-sort-baseline-ms <ms>` (default `1`)

Example:
```bash
node cloud/admin/backfillProfileGamesFirestore.js --project mons-link --dry-run --limit 1000
node cloud/admin/backfillProfileGamesFirestore.js --project mons-link --since-key auto_abc123 --limit 5000
node cloud/admin/backfillProfileGamesFirestore.js --project mons-link --list-sort-baseline-ms 1
```

---

## 9) Deploy / Backfill / Launch Runbook

## 9.1 Deploy backend
From `cloud`:
```bash
firebase deploy --only functions
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only database
```

## 9.2 Verify projector health before backfill
Check:
- function invocation rate is expected (no storm from reactions/wagers)
- no persistent projector errors
- new invites/matches create/update rows in `users/{profileId}/games/*`

## 9.3 Backfill historical rows
1. dry run with bounded sample
2. inspect output counters (`writes/deletes/skipped/failed`)
3. run real backfill in chunks if needed (`--since-key` + `--limit`)

## 9.4 Post-backfill checks
- parity spot checks for:
  - single-login profiles
  - multi-login linked profiles
  - auto/direct invites
- verify ordering:
  - active above ended
  - pending behavior correct
- verify owner-only read security behavior

## 9.5 Launch steps
- keep monitoring projector errors, write volume, and latency
- if stable, keep current UI path enabled

---

## 10) Known Limits (Current)

- catch-up is bounded; no automated continuation queue yet
- profile-mode fallback currently activates on Firestore subscription failure (not empty-result fallback)
- eventual consistency exists between RTDB writes and Firestore projection
- opponent snapshot fields are not continuously refreshed for profile edits (acceptable for now)

---

## 11) Next Steps (from Original Product Direction)

Near-term:
1. Add wager-attention state (outgoing proposal waiting) with careful trigger/write budget.
2. Add explicit continuation strategy for very large profile-link catch-up workloads.
3. Decide tutorial UX for completed users: full list vs compact “Tutorial” entry row.
4. Add richer row badges (kind + pending/attention) if it improves scan speed.

Mid-term:
1. Your-turn attention model (prefer lightweight/visible-subset strategy first, avoid high-frequency backend writes).
2. Optional ranking refinements and custom bucket policy.
3. Better observability dashboards for projection lag, skipped writes, and catch-up incompletes.

Future expansion:
1. Mixed item families in same navigation feed:
   - tournaments
   - public recent games
   - favorites/pinned boards
   - local/bot resume entries
2. Global navigation badging for “needs attention”.
3. Analytics surfaces (rating trends, piece usage, game insights).

---

## 12) Operating Principles

- Keep gameplay truth in RTDB.
- Keep list reads fast and simple.
- Prefer deterministic recompute over scattered ad-hoc updates.
- Avoid writes tied to move-frequency events.
- Add attention/ranking complexity only with explicit cost controls.
