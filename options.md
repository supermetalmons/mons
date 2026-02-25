# options.md - Option C Deep-Dive Plan (Firestore Profile Game Index)

## Scope
- This document now focuses only on **Option C**.
- Goal: fast, profile-scoped game list in `NavigationPicker`, while keeping RTDB as source of truth for invites and live matches.
- Out of scope: replacing live gameplay sync with Firestore.

## Locked Decisions (This Iteration)
- Anonymous behavior: **fallback enabled** (show current-login games from RTDB if no profile-scoped index is available).
- UI density: include **opponent name + opponent emoji** in each game row.
- Navigation behavior: selecting a row navigates by `inviteId`; runtime match selection remains RTDB-driven by existing logic.

## Success Criteria
- A signed-in player opens navigation and sees a sorted list of their games across all login UIDs linked to one profile.
- Query is a single Firestore read path (`users/{profileId}/games`) with index-backed ordering.
- RTDB write path for gameplay is unchanged.
- Projected list updates are near-real-time and idempotent.

## Current Constraints (Why this design)
- Live games are scattered by login UID under RTDB `players/{loginUid}/matches/{matchId}`.
- Profile identity is in Firestore (`users/{profileId}` with `logins[]`), and RTDB login nodes store `players/{uid}/profile`.
- Existing `NavigationPicker` has no game list data model or subscription path.

## Option C Architecture

### 1) Read Model Location
- Firestore subcollection per profile:
  - `users/{profileId}/games/{inviteId}`
- One document per invite series (not one doc per rematch match).

### 2) Document Schema (per profile + invite)

Example payload:

```json
{
  "inviteId": "auto_AbC123XyZ09",
  "kind": "auto",
  "ownerProfileId": "p_owner",
  "ownerLoginId": "uid_owner_current_or_last_seen",
  "ownerRole": "host",
  "opponentProfileId": "p_opponent",
  "opponentLoginId": "uid_opponent_current_or_last_seen",
  "hostLoginId": "uid_host",
  "guestLoginId": "uid_guest",
  "opponentDisplayName": "rival123",
  "opponentEmojiId": 17,
  "status": "active",
  "latestMatchId": "auto_AbC123XyZ092",
  "listSortAt": "serverTimestamp",
  "lastEventType": "rematch_proposed",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp",
  "endedAt": null,
  "projectorVersion": 1,
  "source": "rtdb-projector"
}
```

Field rules:
- `inviteId`: doc id mirror.
- `kind`: `auto` if inviteId starts with `auto_`, else `direct`.
- `status`:
  - `waiting`: guest not joined.
  - `active`: guest joined and no series end marker.
  - `ended`: series end marker found.
- `opponentDisplayName`:
  - snapshot string for cell rendering; projector resolves from opponent profile (username preferred, otherwise address-short form when available, otherwise `anon`).
- `opponentEmojiId`:
  - snapshot numeric emoji id from opponent profile when known.
- `latestMatchId`: derived from invite rematch metadata (`inviteId`, `inviteId1`, `inviteId2`, ...).
- `listSortAt`:
  - list-order key used by UI query ordering; v1 defaults to same event time as `updatedAt`.
- `lastEventType`:
  - lightweight reason code for latest rank-relevant update (`invite_created`, `guest_joined`, `rematch_proposed`, `series_ended`, etc.).
- `createdAt`:
  - first creation only (`set(..., { merge: true })` + preserve if exists).
- `updatedAt`:
  - each meaningful projector update.
- `endedAt`:
  - set once when status transitions to `ended`; otherwise null.

### 3) Status + latestMatchId Derivation

Status derivation from `invites/{inviteId}`:
- `ended` if `hostRematches` or `guestRematches` ends with `x`.
- else `active` if `guestId` exists.
- else `waiting`.

`latestMatchId` derivation:
- Parse rematch indices from `hostRematches` and `guestRematches` after trimming trailing `x`.
- `latestIndex = max(0, ...hostIndices, ...guestIndices)`.
- `latestMatchId = inviteId` when `latestIndex = 0`, otherwise `${inviteId}${latestIndex}`.

Notes:
- We intentionally use invite-series granularity so list remains stable and cheap.
- We do not update the list on every move. We only update on lifecycle events.
- `latestMatchId` is for display/context only; click navigation still passes only `inviteId`.
- After route open, existing runtime logic in `connection.connectToGame(...)` decides which match is active from RTDB state (including non-ended series behavior).

### 3.1) Ordering Strategy (v1 + extensibility)
- v1 ordering query: `orderBy("listSortAt", "desc")`.
- v1 default behavior: projector sets `listSortAt = updatedAt` on meaningful invite-series events.
- This gives immediate extensibility:
  - we can later bump `listSortAt` for specific events (for example pending/rematch attention) without changing audit `updatedAt` semantics.
  - we can keep event-specific behavior keyed by `lastEventType`.

## Projector Design (RTDB -> Firestore)

### 4) Triggers

Add new module:
- `cloud/functions/profileGamesProjector.js`

Exports:
- `projectInviteToProfileGames`
  - trigger: `onValueWritten("/invites/{inviteId}")`
  - responsibility:
    - upsert host profile doc
    - if guest exists, upsert guest profile doc
    - refresh status, opponent fields (name+emoji), latestMatchId, listSortAt, updatedAt, endedAt
- `projectMatchCreateToProfileGames`
  - trigger: `onValueCreated("/players/{loginUid}/matches/{matchId}")`
  - responsibility:
    - if `matchId` belongs to an invite series (always true in current design), touch corresponding `users/{profileId}/games/{inviteId}` with rank/event metadata (`listSortAt`, `updatedAt`, `lastEventType`)
    - do not process on match updates to avoid per-move write amplification

### 5) Profile Resolution Strategy
- For login UID -> profileId:
  1. Read RTDB `players/{uid}/profile`.
  2. If missing, fallback to Firestore query `users.where("logins", "array-contains", uid).limit(1)`.
- Cache UID->profileId in function process memory for warm invocations.
- For opponent display snapshot:
  - resolve opponent profile doc and extract display name + emoji id with safe fallbacks.
  - include these snapshots in projected game docs to avoid N+1 client reads for list rendering.

### 6) Idempotency + Write Suppression
- Deterministic doc path: `users/{profileId}/games/{inviteId}`.
- Use `set(..., { merge: true })`.
- Before write, compare computed payload against existing Firestore doc (subset fields).
- Skip write if no meaningful field changed.
- Only set `endedAt` on first transition to `ended`.

### 7) Deletes / Edge Cases
- If invite is deleted in RTDB:
  - mark existing game docs as `ended` and set `updatedAt` (do not hard-delete initially).
- If guest leaves (unexpected path):
  - recompute status from invite shape and update docs.
- If opponent profile cannot be resolved:
  - write owner doc with null opponent profile fields; projector will fill later on next event.

## Security + Indexes

### 8) Firestore Rules

Update `cloud/firestore.rules` with a subcollection rule:
- Path: `match /users/{userId}/games/{inviteId}`
- Read allowed if:
  - `request.auth != null`
  - parent user doc exists
  - parent `logins` contains `request.auth.uid`
- Client write denied.

Keep existing `/users/{userId}` update policy unchanged.

### 9) Firestore Indexes

Update `cloud/firestore.indexes.json`:
- Composite index for collection `games`:
  - `status` ASC
  - `listSortAt` DESC
- (optional) collection index for all games:
  - `listSortAt` DESC

Reason:
- Required for `where("status", "==", "active") + orderBy("listSortAt", "desc")`.
- Plain `orderBy(listSortAt)` query can use single-field index.

## Backfill Plan (Historical Data)

### 10) Script

Add:
- `cloud/admin/backfillProfileGamesFirestore.js`

Behavior:
- Iterate RTDB `invites` in pages.
- For each invite:
  - resolve host/guest profile ids
  - compute status/kind/latestMatchId
  - upsert both profile docs
- CLI flags:
  - `--project <id>`
  - `--dry-run`
  - `--limit <n>`
  - `--since-key <inviteId>`

Operational defaults:
- Batch Firestore writes (e.g., 200-400 operations per commit).
- Retry transient errors with exponential backoff.
- Emit summary counters:
  - invites scanned
  - docs created/updated/skipped
  - unresolved profile mappings

## Client Integration Plan

### 11) Types
- Add `NavigationGameItem` to `src/connection/connectionModels.ts`.

Suggested shape:
- `inviteId: string`
- `kind: "auto" | "direct"`
- `status: "waiting" | "active" | "ended"`
- `latestMatchId: string`
- `opponentDisplayName?: string`
- `opponentEmojiId?: number | null`
- `opponentProfileId?: string | null`
- `opponentLoginId?: string | null`
- `listSortAtMs: number`
- `lastEventType?: string`
- `updatedAtMs: number`

### 12) Connection API
- Add `subscribeProfileGamesFirestore(limit, onUpdate, onError)` in `src/connection/connection.ts`.
- Query path:
  - `collection(this.firestore, "users", profileId, "games")`
  - `orderBy("listSortAt", "desc")`
  - `limit(n)`
- If profile id is unavailable:
  - **fallback path enabled**: query current-login RTDB games (Option A-lite, current UID only) and map to same `NavigationGameItem` shape.

### 13) UI Wiring
- `src/ui/NavigationPicker.tsx`
  - add props: `games`, `isGamesLoading`, `onSelectGame(inviteId)`
  - render `GAMES` section above/below `LEARN` (decision below)
  - per-row display: opponent emoji, opponent name, type/status badge, invite short id
- `src/ui/BottomControls.tsx`
  - own subscription lifecycle tied to popup visibility
  - on row click: call `transition({ mode: "invite", inviteId, ... })` via app session manager

### 14) Fallback Behavior
- Primary behavior:
  - signed-in with profile: Firestore index.
- Locked fallback:
  - no profile index path available: read current login UID games from RTDB and render a limited local list.
- UI message for fallback mode:
  - indicate this is current-login-only history (not merged cross-login profile history).

## Rollout Plan

### Phase 1 - Backend shadow mode
- Deploy projector, rules, indexes.
- Keep UI unchanged.
- Verify projector logs and sampled docs.

### Phase 2 - Backfill
- Run backfill script with dry-run first.
- Run full backfill.
- Validate counts and random samples vs RTDB invite reality.

### Phase 3 - UI enablement with guard
- Enable `NavigationPicker` game section behind feature flag.
- Read from Firestore index.
- Keep temporary fallback guard path if needed.

### Phase 4 - Cleanup
- Remove fallback path if parity is stable.
- Keep projector and backfill script as operational tools.

## Overhead Expectations (Option C)
- Function invocations increase on invite lifecycle events.
- Firestore writes increase by summary upserts per invite/series transition.
- No per-move projection writes if `matches` trigger is create-only.
- Runtime/gameplay path remains RTDB-first and unaffected.
- Additional overhead for richer cells:
  - projector does extra read(s) to resolve opponent name/emoji snapshots.
  - this is event-bound overhead, not per-move overhead.

## Implementation Checklist by File
- `cloud/functions/profileGamesProjector.js`
  - add invite + match-create projector triggers
- `cloud/functions/index.js`
  - export projector triggers
- `cloud/firestore.rules`
  - add `/users/{userId}/games/{inviteId}` read rule for owner profile only
- `cloud/firestore.indexes.json`
  - add `status + listSortAt` composite index
- `cloud/admin/backfillProfileGamesFirestore.js`
  - add paginated historical backfill
- `src/connection/connectionModels.ts`
  - add `NavigationGameItem`
- `src/connection/connection.ts`
  - add Firestore games subscription API
- `src/ui/NavigationPicker.tsx`
  - add games section rendering + callbacks
- `src/ui/BottomControls.tsx`
  - wire subscription lifecycle + navigation on selection

## Test Plan

### Functional
- Single-login profile sees all expected games.
- Multi-login profile sees merged history across all linked UIDs.
- Automatch and direct invites both appear with correct `kind`.
- Opponent name + emoji render correctly from snapshot fields; fallback values render when missing.
- Status transitions: waiting -> active -> ended.
- Rematch proposal/approval updates `latestMatchId`, `listSortAt`, and ordering.
- Clicking row opens correct invite route and reconnects.
- No-profile fallback path shows current-login-only list.

### Security
- User cannot read another profile's `/games` subcollection.
- Unauthenticated caller cannot read `/games`.
- Client cannot write `/games` documents.

### Migration
- Backfill creates expected doc counts.
- Projector + backfill produce same shape/version.
- Re-running backfill is idempotent (mostly updates/skips, no corruption).

## Open Questions to Iterate Before Implementation
1. Row ordering semantics (still open):
- Keep `listSortAt` equal to lifecycle updates only, or apply extra custom boosts for specific event types?
2. `latestMatchId` semantics (still open):
- keep current `max proposed index` default, or change to `latest mutually-approved index` for display?
3. Doc retention:
- Keep ended games forever, or introduce archival window later?

## Assumptions
- One list row per invite series is sufficient for first release.
- RTDB remains source of truth for gameplay and invites.
- Eventual consistency up to a few seconds is acceptable for navigation list UI.
- Projector versioning (`projectorVersion`) will be used for future schema migrations.
