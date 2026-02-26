# plan_implementation.md - Technical Spec for Game Navigation

This is the code-facing specification that backs `plan.md`.

## 1) Delivery Scope

## 1.1 V1 (foundation)
- Profile-scoped game list read model in Firestore.
- Active games sorted above ended games.
- Immediate pending automatch row behavior.
- Current-login fallback when profile index path is unavailable.
- Navigation popup renders compact game rows (opponent emoji + name + status/type).

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
  - [cloud/functions/cancelAutomatch.js](cloud/functions/cancelAutomatch.js)

Profile resolution anchors:
- [src/connection/connection.ts:554](src/connection/connection.ts:554)
- [cloud/functions/utils.js:287](cloud/functions/utils.js:287)
- [cloud/functions/verifyEthAddress.js:44](cloud/functions/verifyEthAddress.js:44)
- [cloud/functions/verifySolanaAddress.js:47](cloud/functions/verifySolanaAddress.js:47)

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
- `latestMatchId: string`
- `sortBucket: number`
- `listSortAt: Timestamp`
- `lastEventType: string`
- `createdAt: Timestamp`
- `updatedAt: Timestamp`
- `endedAt: Timestamp | null`
- `projectorVersion: number`
- `source: "rtdb-projector"`

Display snapshot fields:
- `opponentProfileId: string | null`
- `opponentLoginId: string | null`
- `opponentDisplayName: string`
- `opponentEmojiId: number | null`

Attention fields (v1 foundation):
- `isPendingAutomatch: boolean`
- `hasPendingOutgoingWager: boolean`

### 3.2 Sort buckets (v1)
- `20`: active
- `30`: waiting + pending automatch
- `40`: waiting normal
- `50`: ended

Primary query order:
- `orderBy(sortBucket, asc)`
- then `orderBy(listSortAt, desc)`

This enforces active-on-top while keeping future attention bucket space.

---

## 4) Projection Triggers (RTDB -> Firestore)

Add module:
- `cloud/functions/profileGamesProjector.js`

### 4.1 `projectInviteToProfileGames`
Trigger:
- `onValueWritten("/invites/{inviteId}")`

Responsibilities:
- derive `kind/status/latestMatchId`
- derive `hasPendingOutgoingWager` per owner side
- resolve owner/opponent profile IDs
- resolve opponent name/emoji snapshots
- compute `sortBucket`
- upsert host and guest docs (when applicable)
- preserve idempotency and write suppression

### 4.2 `projectMatchCreateToProfileGames`
Trigger:
- `onValueCreated("/players/{loginUid}/matches/{matchId}")`

Responsibilities:
- derive root `inviteId` from `matchId`
- resolve owner profile id
- touch row recency fields (`listSortAt`, `updatedAt`, `lastEventType="match_created"`)
- avoid per-move processing (create-only trigger)

### 4.3 `projectAutomatchQueueToProfileGames`
Trigger:
- `onValueWritten("/automatch/{inviteId}")`

Responsibilities:
- when automatch queue entry appears:
  - ensure immediate pending row (`isPendingAutomatch=true`, bucket 30)
- when queue entry disappears:
  - if invite has no guest and remains waiting, remove pending row for that owner
  - if invite got accepted (`guestId` exists), keep row and clear pending state

This trigger is required to satisfy immediate pending automatch UX and cancel-removal behavior.

---

## 5) Derivation Rules

## 5.1 Status
- `ended` if rematch string has terminal `x`
- `active` if guest exists and not ended
- `waiting` otherwise

## 5.2 Latest match id
- parse rematch indices from host/guest strings after trimming trailing `x`
- `latestIndex = max(0, ...indices)`
- latest id is `inviteId` or `inviteId + latestIndex`

## 5.3 Pending outgoing wager
From invite wager state:
- true when owner has a proposal pending response (no agreed/resolved yet for current relevant match context)
- false otherwise

## 5.4 Sort bucket
Function:
1. if ended -> 50
2. else if active -> 20
3. else if waiting and pending automatch -> 30
4. else waiting -> 40

(Your-turn and other attention buckets are intentionally deferred.)

---

## 6) Firestore Rules

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

## 7) Firestore Indexes

Update [cloud/firestore.indexes.json](cloud/firestore.indexes.json):

Composite index for collection group `games`:
- `sortBucket` ASC
- `listSortAt` DESC

Optional secondary composite (if filtering active):
- `status` ASC
- `listSortAt` DESC

---

## 8) Backfill

Add script:
- `cloud/admin/backfillProfileGamesFirestore.js`

Reuse admin bootstrap:
- [cloud/admin/_admin.js](cloud/admin/_admin.js)

Backfill flow:
1. page through RTDB invites
2. derive summary fields
3. resolve host/guest/opponent snapshots
4. upsert both owner docs
5. batch writes + retries + counters

CLI options:
- `--project`
- `--dry-run`
- `--limit`
- `--since-key`

Idempotent by design.

---

## 9) Frontend Model and APIs

## 9.1 Type additions
Update [src/connection/connectionModels.ts](src/connection/connectionModels.ts):

```ts
export type NavigationGameStatus = "waiting" | "active" | "ended";

export interface NavigationGameItem {
  entityType: "game";
  inviteId: string;
  kind: "auto" | "direct";
  status: NavigationGameStatus;
  latestMatchId: string;
  sortBucket: number;
  listSortAtMs: number;
  updatedAtMs: number;
  lastEventType?: string;
  opponentDisplayName?: string;
  opponentEmojiId?: number | null;
  opponentProfileId?: string | null;
  opponentLoginId?: string | null;
  isPendingAutomatch?: boolean;
  hasPendingOutgoingWager?: boolean;
  isCurrentLoginFallback?: boolean;
}
```

## 9.2 Connection methods
Update [src/connection/connection.ts](src/connection/connection.ts):
- `subscribeProfileGamesFirestore(limit, onUpdate, onError): () => void`
  - query by `sortBucket asc, listSortAt desc`
- `getCurrentLoginFallbackGames(limit): Promise<NavigationGameItem[]>`
  - current-login-only RTDB fallback

---

## 10) Navigation UI Integration

## 10.1 NavigationPicker props and layout
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

## 10.2 BottomControls wiring
Update [src/ui/BottomControls.tsx](src/ui/BottomControls.tsx):
- manage subscription lifecycle on popup open/close
- load fallback path when profile index unavailable
- pass quick action handlers into `NavigationPicker`
- route on row selection via app session transition

---

## 11) Tutorial Placement Implementation Notes

Current tutorial list is tied to existing puzzle rendering in `NavigationPicker`.

Required update direction:
- decouple tutorial visibility from home-only assumptions
- support:
  - incomplete tutorial rows above games
  - completed users still see tutorial entry point

Use existing problems/tutor progress APIs; no backend changes required.

---

## 12) Testing Matrix

Functional:
- active games always sorted above ended
- pending automatch row appears immediately after automatch start
- pending automatch row removed on cancel
- accepted automatch row persists
- direct and automatch rows coexist
- fallback current-login list works when profile index unavailable
- compact row shows opponent name+emoji with safe fallback values

Security:
- owner read allowed
- non-owner/unauthenticated denied
- client writes denied

Migration:
- backfill parity, idempotency, and re-run safety

Performance:
- no per-move projection writes
- acceptable list query latency at target limit sizes

---

## 13) Implementation Sequence

1. Add projector module with 3 triggers (`invites`, `matches created`, `automatch queue`).
2. Export triggers in `cloud/functions/index.js`.
3. Update Firestore rules and indexes.
4. Add and test backfill script.
5. Deploy backend in shadow mode; validate docs.
6. Add frontend types and connection APIs.
7. Integrate navigation UI (games + actions + tutorial placement).
8. Enable feature flag and monitor.
9. Iterate on wager separation and ranking adjustments.

---

## 14) Deferred Technical Strategy (for later)

Your-turn indicator should avoid high-frequency backend writes.

Preferred direction later:
- compute turn-attention for small visible active subset client-side on popup open
- optionally cache short-lived results locally
- only introduce backend projection if proven necessary and bounded

