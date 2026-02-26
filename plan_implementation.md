# plan_implementation.md - Technical Implementation Specification

This document contains the code-level implementation details for the profile game list read model.

## 1) Current Code Touchpoints (Source of Truth References)

Primary existing write paths:
- client invite create writes to RTDB players + invites:
  - [src/connection/connection.ts:2530](src/connection/connection.ts:2530)
  - [src/connection/connection.ts:2531](src/connection/connection.ts:2531)
- client rematch proposal writes next match + rematch string:
  - [src/connection/connection.ts:915](src/connection/connection.ts:915)
  - [src/connection/connection.ts:919](src/connection/connection.ts:919)
  - [src/connection/connection.ts:922](src/connection/connection.ts:922)
- client join path creates guest-side match:
  - [src/connection/connection.ts:2473](src/connection/connection.ts:2473)

Automatch function write paths:
- [cloud/functions/automatch.js:114](cloud/functions/automatch.js:114)
- [cloud/functions/automatch.js:116](cloud/functions/automatch.js:116)
- [cloud/functions/automatch.js:140](cloud/functions/automatch.js:140)

Profile resolution paths:
- Firestore by login array contains:
  - [src/connection/connection.ts:554](src/connection/connection.ts:554)
  - [cloud/functions/utils.js:287](cloud/functions/utils.js:287)
- RTDB players/{uid}/profile set in wallet verification:
  - [cloud/functions/verifyEthAddress.js:44](cloud/functions/verifyEthAddress.js:44)
  - [cloud/functions/verifyEthAddress.js:70](cloud/functions/verifyEthAddress.js:70)
  - [cloud/functions/verifySolanaAddress.js:47](cloud/functions/verifySolanaAddress.js:47)
  - [cloud/functions/verifySolanaAddress.js:73](cloud/functions/verifySolanaAddress.js:73)

UI insertion points:
- [src/ui/NavigationPicker.tsx:8](src/ui/NavigationPicker.tsx:8)
- [src/ui/NavigationPicker.tsx:195](src/ui/NavigationPicker.tsx:195)
- [src/ui/BottomControls.tsx:1511](src/ui/BottomControls.tsx:1511)

Rules/index entry points:
- [cloud/firestore.rules:7](cloud/firestore.rules:7)
- [cloud/firestore.indexes.json](cloud/firestore.indexes.json)

---

## 2) New Firestore Read Model

Collection path:
- `users/{profileId}/games/{inviteId}`

## 2.1) Firestore document fields

Required:
- `inviteId: string`
- `kind: "auto" | "direct"`
- `ownerProfileId: string`
- `ownerLoginId: string | null`
- `ownerRole: "host" | "guest"`
- `hostLoginId: string | null`
- `guestLoginId: string | null`
- `status: "waiting" | "active" | "ended"`
- `latestMatchId: string`
- `listSortAt: Timestamp`
- `lastEventType: string`
- `createdAt: Timestamp`
- `updatedAt: Timestamp`
- `endedAt: Timestamp | null`
- `projectorVersion: number`
- `source: "rtdb-projector"`

Optional (for UI row density):
- `opponentProfileId: string | null`
- `opponentLoginId: string | null`
- `opponentDisplayName: string`
- `opponentEmojiId: number | null`

---

## 3) New Cloud Functions Module

Add file:
- `cloud/functions/profileGamesProjector.js`

Runtime:
- Node 20 (already configured in [cloud/functions/package.json](cloud/functions/package.json))

Imports:
- `firebase-functions/v2/database` (`onValueWritten`, `onValueCreated`)
- `firebase-admin`

Exports (from this module):
- `projectInviteToProfileGames`
- `projectMatchCreateToProfileGames`

### 3.1) `projectInviteToProfileGames`
Trigger path:
- `/invites/{inviteId}` via `onValueWritten`

Flow:
1. Read `before` and `after` invite payloads.
2. If invite deleted:
   - soft-end docs for known host/guest profiles if resolvable.
3. Else compute:
   - `kind`
   - `status`
   - `latestMatchId`
   - `lastEventType`
4. Resolve host and guest profile IDs.
5. Resolve opponent snapshots (name + emoji) per owner side.
6. Upsert owner docs for host/guest with write suppression.

### 3.2) `projectMatchCreateToProfileGames`
Trigger path:
- `/players/{loginUid}/matches/{matchId}` via `onValueCreated`

Flow:
1. Derive `inviteId` from `matchId`:
   - if starts with `auto_`, root length = 16 (`"auto_" + 11 chars`)
   - else root length = 11
2. Resolve profileId for `loginUid`.
3. Touch corresponding summary doc:
   - `listSortAt = now`
   - `updatedAt = now`
   - `lastEventType = "match_created"`
4. Do not process on updates (no per-move amplification).

### 3.3) Helper functions (in module)
- `deriveInviteIdFromMatchId(matchId: string): string`
- `parseRematchIndices(rematches: string | null | undefined): number[]`
- `deriveLatestMatchId(inviteId, hostRematches, guestRematches): string`
- `deriveStatus(invite): "waiting" | "active" | "ended"`
- `resolveProfileIdByLoginUid(uid): Promise<string | null>`
- `resolveOpponentSnapshot(profileId): Promise<{displayName, emojiId}>`
- `buildDisplayName(userDocData): string`
- `upsertGameDoc(profileId, inviteId, payload): Promise<void>` with write suppression

### 3.4) Write suppression criteria
Compare current doc fields before writing:
- `status`, `latestMatchId`, `hostLoginId`, `guestLoginId`
- `opponentProfileId`, `opponentLoginId`, `opponentDisplayName`, `opponentEmojiId`
- `lastEventType`

Skip write if unchanged.

`createdAt` behavior:
- set only when doc does not exist.

`endedAt` behavior:
- set only on transition to `ended`.

---

## 4) Cloud Functions index export changes

Update [cloud/functions/index.js](cloud/functions/index.js):
- import from `./profileGamesProjector`
- export:
  - `exports.projectInviteToProfileGames = projectInviteToProfileGames`
  - `exports.projectMatchCreateToProfileGames = projectMatchCreateToProfileGames`

---

## 5) Firestore Rules Changes

Update [cloud/firestore.rules](cloud/firestore.rules):

Add block:

```rules
match /users/{userId}/games/{inviteId} {
  allow read: if request.auth != null
    && exists(/databases/$(database)/documents/users/$(userId))
    && get(/databases/$(database)/documents/users/$(userId)).data.logins != null
    && get(/databases/$(database)/documents/users/$(userId)).data.logins.hasAll([request.auth.uid]);
  allow write: if false;
}
```

Keep existing `/users/{userId}` update rule unchanged.

---

## 6) Firestore Indexes

Update [cloud/firestore.indexes.json](cloud/firestore.indexes.json) with composite index:
- collection group: `games`
- fields:
  - `status` ASCENDING
  - `listSortAt` DESCENDING

Optional additional query support:
- order by `listSortAt` only (single-field usually automatic)

---

## 7) Backfill Script

Add:
- `cloud/admin/backfillProfileGamesFirestore.js`

Reuse:
- [cloud/admin/_admin.js](cloud/admin/_admin.js)

Script behavior:
1. Initialize admin SDK.
2. Page through RTDB `invites` by key.
3. For each invite:
   - resolve host/guest profile IDs
   - compute summary fields (`kind`, `status`, `latestMatchId`, timestamps)
   - resolve opponent display snapshots
   - upsert 1-2 Firestore docs
4. Batch writes (200-400 per commit).
5. Emit counters:
   - `invitesScanned`
   - `docsCreated`
   - `docsUpdated`
   - `docsSkipped`
   - `unresolvedProfiles`

CLI args:
- `--project`
- `--dry-run`
- `--limit`
- `--since-key`

Idempotency:
- script can be rerun safely.

---

## 8) Frontend Type Additions

Update [src/connection/connectionModels.ts](src/connection/connectionModels.ts):

```ts
export type NavigationGameStatus = "waiting" | "active" | "ended";

export interface NavigationGameItem {
  inviteId: string;
  kind: "auto" | "direct";
  status: NavigationGameStatus;
  latestMatchId: string;
  opponentDisplayName?: string;
  opponentEmojiId?: number | null;
  opponentProfileId?: string | null;
  opponentLoginId?: string | null;
  listSortAtMs: number;
  lastEventType?: string;
  updatedAtMs: number;
  isCurrentLoginFallback?: boolean;
}
```

---

## 9) Connection Layer Changes

Update [src/connection/connection.ts](src/connection/connection.ts):

### 9.1) Firestore subscription API
Add method:
- `subscribeProfileGamesFirestore(limit, onUpdate, onError): () => void`

Query:
- `collection(this.firestore, "users", profileId, "games")`
- `orderBy("listSortAt", "desc")`
- `limit(limitValue)`

Mapping:
- convert Firestore docs to `NavigationGameItem`
- convert timestamp fields to ms numbers

### 9.2) No-profile fallback API
Add method:
- `getCurrentLoginFallbackGames(limit): Promise<NavigationGameItem[]>`

Fallback flow:
1. Resolve current login UID (`this.auth.currentUser?.uid` or sign in if needed).
2. Read RTDB `players/{uid}/matches` (single current login only).
3. Derive invite roots from match ids.
4. Fetch corresponding `invites/{inviteId}` payloads.
5. Build rows with limited data and `isCurrentLoginFallback = true`.
6. Sort by best available recency heuristic.

### 9.3) Helper additions
- `mapGameDocToNavigationItem(doc)`
- `deriveInviteIdFromMatchId(matchId)` (same logic used in projector)

---

## 10) NavigationPicker UI Changes

Update [src/ui/NavigationPicker.tsx](src/ui/NavigationPicker.tsx):

Props extension:
- `games?: NavigationGameItem[]`
- `isGamesLoading?: boolean`
- `onSelectGame?: (inviteId: string) => void`
- `gamesFallbackNotice?: string | null`

UI additions:
- `GAMES` section
- loading state row
- empty state row
- row template with:
  - opponent emoji icon
  - opponent name
  - status/type badge
  - invite short id

Interaction:
- click row -> `onSelectGame(inviteId)`

---

## 11) BottomControls Wiring

Update [src/ui/BottomControls.tsx](src/ui/BottomControls.tsx):

New state:
- `navigationGames: NavigationGameItem[]`
- `isNavigationGamesLoading: boolean`
- `gamesFallbackNotice: string | null`
- `unsubscribeProfileGamesRef`

Lifecycle:
- when navigation popup opens:
  - if profile id exists -> subscribe Firestore index
  - else -> run current-login fallback fetch
- when popup closes:
  - unsubscribe listener

Routing:
- add handler `handleSelectNavigationGame(inviteId)`
- use app session transition to route `/{inviteId}`

Keep existing puzzle section behavior intact.

---

## 12) Suggested Feature Flag

Add temporary frontend flag (env or constant):
- `ENABLE_PROFILE_GAME_LIST`

Use to stage rollout:
- backend can run shadow mode before UI activation

---

## 13) Tests and Verification

### 13.1) Backend projection correctness
- invite create -> host row created (`waiting`)
- guest join -> host+guest rows active
- rematch update -> `latestMatchId` changes
- end marker -> `status=ended`, `endedAt` set once

### 13.2) UI behavior
- signed-in profile path loads Firestore list
- no-profile path loads fallback list
- row click navigates to invite route

### 13.3) Security rules
- valid owner can read
- non-owner denied
- unauthenticated denied
- client write denied

### 13.4) Migration
- dry-run reports expected counts
- full backfill creates/upserts rows
- re-run backfill remains idempotent

---

## 14) Implementation Sequence (Suggested)

1. Add projector module + export in functions index.
2. Add Firestore rules + indexes.
3. Add backfill script.
4. Deploy backend in shadow mode.
5. Validate projected docs.
6. Add frontend model + connection API + fallback API.
7. Add UI rendering and wiring in `BottomControls`/`NavigationPicker`.
8. Enable feature flag.
9. Monitor and tune ordering logic.

---

## 15) Notes on Line References
Line links in this document are based on the current repository snapshot and may drift after edits. Keep behavior and path contracts authoritative over exact line numbers.
