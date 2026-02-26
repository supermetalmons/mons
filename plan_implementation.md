# plan_implementation.md - Technical Spec for Game Navigation

This is the code-facing specification that backs `plan.md`.

## 1) Delivery Scope

## 1.1 V1 (foundation)
- Profile-scoped game list read model in Firestore.
- Active games sorted above ended games.
- Pending automatch row behavior based on automatch queue presence.
- Current-login fallback when profile index path is unavailable.
- Fallback pending/cancel correctness via invite-visible marker fields (not queue reads).
- Navigation popup renders compact game rows (opponent emoji + name + status/type).
- Row click navigates by invite route only (`/${inviteId}`).

## 1.2 V1.1 (next small increment)
- Outgoing wager pending indicator and optional sectioning.
- Optional rank tweaks via event-driven sort buckets.

## 1.3 Postpone intentionally
- Your-turn rank/badge (requires careful low-write strategy).
- Rematch score/moves enrichments in list rows.
- Multi-family items (tournaments/public/favorites/local cross-device resume).

---

## 2) Current Code Anchors

Write model anchors (unchanged):
- invite create + match create client:
  - [src/connection/connection.ts:2530](src/connection/connection.ts:2530)
  - [src/connection/connection.ts:2531](src/connection/connection.ts:2531)
- rematch proposal write path:
  - [src/connection/connection.ts:915](src/connection/connection.ts:915)
  - [src/connection/connection.ts:919](src/connection/connection.ts:919)
  - [src/connection/connection.ts:922](src/connection/connection.ts:922)
- guest-side match creation:
  - [src/connection/connection.ts:2473](src/connection/connection.ts:2473)
- automatch function writes:
  - [cloud/functions/automatch.js:114](cloud/functions/automatch.js:114)
  - [cloud/functions/automatch.js:116](cloud/functions/automatch.js:116)
  - [cloud/functions/automatch.js:140](cloud/functions/automatch.js:140)
- automatch cancel behavior:
  - [cloud/functions/cancelAutomatch.js:33](cloud/functions/cancelAutomatch.js:33)

Profile resolution anchors:
- [src/connection/connection.ts:554](src/connection/connection.ts:554)
- [cloud/functions/utils.js:287](cloud/functions/utils.js:287)
- [cloud/functions/verifyEthAddress.js:44](cloud/functions/verifyEthAddress.js:44)
- [cloud/functions/verifySolanaAddress.js:47](cloud/functions/verifySolanaAddress.js:47)

High-churn invite subtrees to ignore in V1 projection:
- reactions:
  - [src/connection/connection.ts:1828](src/connection/connection.ts:1828)
- wagers:
  - [src/connection/connection.ts:2681](src/connection/connection.ts:2681)
  - [cloud/functions/sendWagerProposal.js:44](cloud/functions/sendWagerProposal.js:44)

Queue visibility constraint:
- clients cannot directly read `/automatch` under current RTDB rules
  - [cloud/database.rules:5](cloud/database.rules:5)

Navigation UI anchors:
- [src/ui/NavigationPicker.tsx:8](src/ui/NavigationPicker.tsx:8)
- [src/ui/BottomControls.tsx:1511](src/ui/BottomControls.tsx:1511)

---

## 3) New Read Model

Path:
- `users/{profileId}/games/{inviteId}`

Granularity:
- one document per invite series

## 3.1 Firestore document fields

Required:
- `entityType: "game"`
- `inviteId: string`
- `kind: "auto" | "direct"`
- `ownerProfileId: string`
- `ownerLoginId: string | null`
- `ownerRole: "host" | "guest"`
- `hostLoginId: string | null`
- `guestLoginId: string | null`
- `status: "waiting" | "active" | "ended"`
- `sortBucket: number`
- `listSortAt: Timestamp`
- `lastEventType: string`
- `lastEventFingerprint: string`
- `createdAt: Timestamp`
- `updatedAt: Timestamp`
- `endedAt: Timestamp | null`
- `isPendingAutomatch: boolean`
- `projectorVersion: number`
- `source: "rtdb-projector"`

Display snapshot fields:
- `opponentProfileId: string | null`
- `opponentLoginId: string | null`
- `opponentDisplayName: string`
- `opponentEmojiId: number | null`

Optional/reserved fields (not required by V1 UI):
- `latestMatchId?: string` (diagnostic only)
- `hasPendingOutgoingWager?: boolean` (deferred until wager-aware projection is enabled)

### 3.2 Sort buckets (v1)
- `20`: active
- `30`: waiting + pending automatch
- `40`: waiting normal
- `50`: ended

Primary query order:
- `orderBy(sortBucket, asc)`
- then `orderBy(listSortAt, desc)`

This enforces active-on-top while keeping future attention bucket space.

### 3.3 Navigation semantics
- UI must navigate by `inviteId` route only.
- UI must not depend on `latestMatchId` for opening a game.

### 3.4 Invite-side fallback marker fields
Stored in RTDB invite node for fallback correctness:
- `automatchCanceledAt: number | null`
- `automatchStateHint: "pending" | "matched" | "canceled"`

Notes:
- maintained by cloud functions/projector path, not by client gameplay writes
- used by fallback path because queue path is unreadable to clients

---

## 4) Projection Architecture (RTDB -> Firestore)

Add module:
- `cloud/functions/profileGamesProjector.js`

Core pattern:
- all triggers call one shared function:
  - `recomputeInviteProjection(inviteId, reason, options)`
- this function reads required RTDB/Firestore state and computes full target owner docs
- this function performs idempotent upsert/delete with write suppression

### 4.1 Narrow trigger strategy
Do not use broad root trigger `onValueWritten("/invites/{inviteId}")` in V1.

Use targeted triggers:
- `onValueCreated("/invites/{inviteId}")`
- `onValueWritten("/invites/{inviteId}/guestId")`
- `onValueWritten("/invites/{inviteId}/hostRematches")`
- `onValueWritten("/invites/{inviteId}/guestRematches")`
- optional: `onValueWritten("/invites/{inviteId}/automatchStateHint")` (if marker is updated outside projector)

Rationale:
- avoids projector invocations on high-churn `reactions`/`wagers` writes
- keeps same shared recompute logic with cleaner event volume

### 4.2 `projectMatchCreateToProfileGames`
Trigger:
- `onValueCreated("/players/{loginUid}/matches/{matchId}")`

Responsibilities:
- resolve root invite ID robustly from `matchId`
- call shared recompute
- keep create-only (no per-move processing)

### 4.3 `projectAutomatchQueueToProfileGames`
Trigger:
- `onValueWritten("/automatch/{inviteId}")`

Responsibilities:
- call shared recompute for queue enter/leave events
- enforce queue-based pending semantics:
  - queue exists + auto invite waiting => pending row visible
  - queue missing + auto invite still waiting => row removed
  - accepted auto invite (`guestId` exists) => persistent non-pending row
- write fallback markers on invite (`automatchStateHint`, `automatchCanceledAt`) as needed

### 4.4 `projectProfileLinkCatchup`
Trigger:
- `onValueCreated("/players/{loginUid}/profile")`

Responsibilities:
- preserve legacy games when user links/signs in later
- scan `players/{loginUid}/matches/*`
- derive unique invite IDs from match IDs
- run bounded-concurrency recompute for each invite ID

Guardrails:
- max invites per invocation (configurable)
- pagination/continuation token for oversized histories
- continuation via task queue or resumable admin path

### 4.5 Shared recompute write suppression
Write only when computed payload changed materially.

Suppression rule:
- fetch existing doc(s)
- compare projection-owned fields
- skip Firestore write if no effective delta

Recency idempotency rule:
- if incoming `lastEventFingerprint` equals stored fingerprint, do not bump `listSortAt`
- avoid reorder churn on duplicate/retried trigger events

---

## 5) Derivation Rules

## 5.1 Status
- `ended` if rematch string has terminal `x`
- `active` if guest exists and not ended
- `waiting` otherwise

## 5.2 Pending automatch
- true only when:
  - invite ID has `auto_` prefix
  - invite is still waiting (`guestId` missing)
  - corresponding queue row exists at `automatch/{inviteId}`

Row removal rule:
- if invite is `auto_`, still waiting, and queue row is absent => remove owner game row

Fallback interpretation rule:
- when queue cannot be read by client, fallback uses `automatchStateHint` + invite state

## 5.3 Latest match id (optional)
- may be derived from rematch strings for diagnostics only
- never used as route target

## 5.4 Match ID -> Invite ID resolver
Use shared helper:
- `resolveInviteIdFromMatchId(matchId)`

Behavior:
- collect candidate invite prefixes from match ID
- prefer longest prefix that exists in `invites/{candidate}`
- treat exact invite ID as valid without suffix stripping
- reject ambiguous/nonexistent candidates

Do not use naive trailing-digit stripping as the sole rule.

## 5.5 Sort bucket
Function:
1. if ended -> 50
2. else if active -> 20
3. else if waiting and pending automatch -> 30
4. else waiting -> 40

## 5.6 `listSortAt` policy
Live projection:
- derive stable event timestamp when possible
- otherwise use current server timestamp once per unique event fingerprint

Backfill projection:
- use low baseline timestamp (for example `Timestamp.fromMillis(1)`) for `listSortAt`
- prevents historical rows from jumping above fresh rows immediately after migration

Protection:
- backfill must not overwrite fresher live `listSortAt` / `updatedAt`

(Your-turn and wager attention buckets are intentionally deferred.)

---

## 6) Cloud Functions Contract Updates

### 6.1 `automatch` callable response
Current shape returns `{ ok, inviteId }`.

Add explicit mode fields:
- `mode: "pending" | "matched"`
- `matchedImmediately: boolean`

Usage:
- UI optimistic pending row only for `mode="pending"`
- skip pending visual state when immediate match is returned

### 6.2 `cancelAutomatch` side effects
In addition to queue removal:
- write invite fallback marker:
  - `automatchStateHint = "canceled"`
  - `automatchCanceledAt = Date.now()`

---

## 7) Firestore Rules

Update [cloud/firestore.rules](cloud/firestore.rules):

```rules
match /users/{userId}/games/{inviteId} {
  allow read: if request.auth != null
    && exists(/databases/$(database)/documents/users/$(userId))
    && get(/databases/$(database)/documents/users/$(userId)).data.logins != null
    && get(/databases/$(database)/documents/users/$(userId)).data.logins.hasAll([request.auth.uid]);
  allow write: if false;
}
```

Keep existing `/users/{userId}` update rule as-is.

---

## 8) Firestore Indexes

Update [cloud/firestore.indexes.json](cloud/firestore.indexes.json):

Composite index for collection group `games`:
- `sortBucket` ASC
- `listSortAt` DESC

Optional secondary composite (if filtering active):
- `status` ASC
- `listSortAt` DESC

---

## 9) Backfill

Add script:
- `cloud/admin/backfillProfileGamesFirestore.js`

Reuse admin bootstrap:
- [cloud/admin/_admin.js](cloud/admin/_admin.js)

Backfill flow:
1. page through RTDB invites
2. derive summary fields
3. resolve host/guest/opponent snapshots
4. apply low-baseline `listSortAt`
5. upsert both owner docs
6. skip write when target doc has fresher live recency fields
7. batch writes + retries + counters

CLI options:
- `--project`
- `--dry-run`
- `--limit`
- `--since-key`
- `--list-sort-baseline-ms` (default `1`)

Idempotent by design.

---

## 10) Frontend Model and APIs

## 10.1 Type additions
Update [src/connection/connectionModels.ts](src/connection/connectionModels.ts):

```ts
export type NavigationGameStatus = "waiting" | "active" | "ended";

export interface NavigationGameItem {
  entityType: "game";
  inviteId: string;
  kind: "auto" | "direct";
  status: NavigationGameStatus;
  sortBucket: number;
  listSortAtMs: number;
  updatedAtMs: number;
  lastEventType?: string;
  opponentDisplayName?: string;
  opponentEmojiId?: number | null;
  opponentProfileId?: string | null;
  opponentLoginId?: string | null;
  isPendingAutomatch?: boolean;
  isCurrentLoginFallback?: boolean;
  isOptimisticLocal?: boolean;
}
```

## 10.2 Connection methods
Update [src/connection/connection.ts](src/connection/connection.ts):
- `subscribeProfileGamesFirestore(limit, onUpdate, onError): () => void`
  - query by `sortBucket asc, listSortAt desc`
- `getCurrentLoginFallbackGames(limit): Promise<NavigationGameItem[]>`
  - current-login-only RTDB fallback
  - uses invite marker hints (`automatchStateHint`, `automatchCanceledAt`) for pending/cancel semantics
- `createOptimisticPendingAutomatchItem(inviteId): NavigationGameItem`
  - local row for immediate UX after automatch starts

---

## 11) Navigation UI Integration

## 11.1 NavigationPicker props and layout
Update [src/ui/NavigationPicker.tsx](src/ui/NavigationPicker.tsx):
- add game list props
- add fallback scope notice prop
- render sections in order:
  1. tutorial (if needed)
  2. games
  3. tutorial access row (when completed)
  4. quick actions (bot/direct/automatch)

Row content:
- opponent emoji + name
- compact badges (kind/status/pending flags)

## 11.2 BottomControls wiring
Update [src/ui/BottomControls.tsx](src/ui/BottomControls.tsx):
- manage subscription lifecycle on popup open/close
- load fallback path when profile index unavailable
- merge optimistic pending automatch row with Firestore list
- clear optimistic row on cancel/error or when projected row arrives
- use automatch response `mode` to decide optimistic row creation
- pass quick action handlers into `NavigationPicker`
- route on row selection via app session transition

---

## 12) Tutorial Placement Implementation Notes

Current tutorial list is tied to existing puzzle rendering in `NavigationPicker`.

Required update direction:
- decouple tutorial visibility from home-only assumptions
- support:
  - incomplete tutorial rows above games
  - completed users still see tutorial entry point

Use existing problems/tutorial progress APIs; no backend changes required.

---

## 13) Testing Matrix

Functional:
- active games always sorted above ended
- pending automatch row appears immediately after automatch start
- pending automatch row removed on cancel even if invite remains
- accepted automatch row persists
- direct and automatch rows coexist
- fallback current-login list works when profile index unavailable
- fallback pending/cancel behavior matches marker hints when queue unreadable
- row click navigates by invite ID and runtime reconnect resolves match
- compact row shows opponent name+emoji with safe fallback values
- linked profile gains legacy login history after `players/{uid}/profile` creation

Projection correctness:
- no projector invocation on `invites/{inviteId}/reactions/*` writes
- no projector invocation on `invites/{inviteId}/wagers/*` writes in V1
- projector writes are idempotent under duplicate trigger execution
- duplicate same-event triggers do not bump `listSortAt`
- robust match-id resolver maps to valid invite IDs only

Security:
- owner read allowed
- non-owner/unauthenticated denied
- client writes denied

Migration:
- backfill parity, idempotency, and re-run safety
- baseline sort policy places historical rows below fresh updates
- backfill does not clobber fresher live recency fields

Performance:
- no per-move projection writes
- acceptable list query latency at target limit sizes
- acceptable projector invocation rate under reaction churn
- profile-link catch-up completes via bounded batches without function timeouts

---

## 14) Implementation Sequence

1. Add projector module with shared recompute function.
2. Add narrow invite triggers + `matches created` + `automatch queue` + `players/{uid}/profile` catch-up trigger.
3. Implement robust `resolveInviteIdFromMatchId` helper and use it everywhere.
4. Update automatch/cancel callable response + marker side effects.
5. Export triggers in `cloud/functions/index.js`.
6. Update Firestore rules and indexes.
7. Add and test backfill script with no-clobber protections.
8. Deploy backend in shadow mode; validate docs, event volume, and idempotency.
9. Add frontend types and connection APIs.
10. Integrate navigation UI (games + actions + tutorial placement + optimistic pending row).
11. Enable feature flag and monitor.
12. Iterate on wager attention and ranking adjustments.

---

## 15) Deferred Technical Strategy (for later)

Your-turn indicator should avoid high-frequency backend writes.

Preferred direction later:
- compute turn-attention for small visible active subset client-side on popup open
- optionally cache short-lived results locally
- only introduce backend projection if proven necessary and bounded

If trigger volume remains high after narrow triggers and suppression:
- consider moving high-churn reaction data out of invite subtree in a separate migration
- keep that migration separate from first game-list rollout
