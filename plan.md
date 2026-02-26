# plan.md - Profile-Scoped Game List Design

## 1) Purpose
Create a fast, profile-scoped list of games for `NavigationPicker` without changing the current realtime gameplay architecture.

The gameplay source of truth stays in Realtime Database. A separate Firestore read model is introduced for fast list rendering.

---

## 2) Product Intent
When a player opens navigation, they should quickly see a unified list of games across all login identities linked to their profile.

This list should:
- open fast
- have stable ordering
- show enough context per row to be useful
- not require expensive fan-out reads at view time
- preserve current invite/game runtime behavior

---

## 3) Non-Goals
- Replacing RTDB gameplay sync with Firestore
- Rebuilding move-level history storage
- Changing invite/rematch game loop semantics
- Making this list a full match analytics view in v1

---

## 4) Architecture Overview
Use a read-model pattern:

- **Write model (existing):** RTDB invite + match state
- **Read model (new):** Firestore profile game summary documents

The read model is populated by backend projection logic that reacts to meaningful invite/match lifecycle events.

This separates:
- low-latency game synchronization concerns
- list-query efficiency concerns

---

## 5) Conceptual Data Model
For each profile and invite series, store one summary document in:

`users/{profileId}/games/{inviteId}`

Document concept:
- invite identity and type (`auto` / `direct`)
- owner and opponent identity snapshots
- row display snapshots (opponent name + emoji)
- lifecycle state (`waiting`, `active`, `ended`)
- derived latest match id for context
- timestamps for creation, update, and end state
- sorting key for list ordering
- lightweight event reason for ranking behavior

### Granularity decision
The list is invite-series based (one row per series), not per rematch game.

Why:
- cleaner UX for navigation
- lower read/write volume
- stable row identity
- easier future filtering and ranking

---

## 6) Event and Projection Model
Projection logic listens to RTDB lifecycle changes and updates Firestore summary docs.

Main event sources:
- invite creation/join/rematch/end transitions
- new match nodes created for the series (not per move updates)

Projection behavior:
- idempotent upsert
- deterministic path
- write suppression when nothing meaningful changed

Design objective:
- near-real-time list freshness
- minimal write amplification

---

## 7) Status Semantics
Status is derived from invite lifecycle shape:
- `waiting`: invite exists but guest not joined
- `active`: guest joined and series not ended
- `ended`: end-of-series marker present

This preserves current gameplay semantics while giving clear list grouping.

---

## 8) Ordering Strategy
Introduce explicit sort field (`listSortAt`) used for row ordering.

v1 behavior:
- `listSortAt` follows meaningful lifecycle updates

Reason for separate sort field:
- allows future custom ranking without rewriting audit semantics
- `updatedAt` can remain broad operational timestamp
- ranking can evolve (attention surfaces, recency boosts, event-driven moves)

This is important for future “move some matches up when new things happen” behavior.

---

## 9) Navigation Semantics
Clicking a list row navigates by invite id.

After navigation:
- existing runtime logic still determines which rematch/match context is active
- list-side derived `latestMatchId` is contextual metadata, not the authority for runtime state

This preserves compatibility with your current RTDB-driven reconnect and rematch behavior.

---

## 10) Display Density Strategy
Row should remain compact but useful.

Current direction:
- opponent emoji
- opponent display name
- small type/status cues
- short invite identity context

Avoid heavy row payloads in v1 to reduce sync complexity.

---

## 11) Anonymous and Partial-Identity Behavior
If profile-scoped index cannot be used, fallback to a limited current-login view.

Behavior:
- show current-login-only game list (not merged profile history)
- clearly indicate limited scope in UI

This gives utility immediately while preserving profile-merged behavior once identity is complete.

---

## 12) Security Model
Client reads only their own profile game summaries.

Principles:
- authenticated-only reads
- profile ownership derived from login membership
- client writes to game summary docs are denied
- projection/backfill paths are backend-owned

---

## 13) Operational Behavior and Overhead
Expected overhead categories:
- extra backend invocations on invite lifecycle events
- summary Firestore writes for series transitions
- occasional profile snapshot reads for opponent display fields

Not expected:
- per-move projection writes
- gameplay latency impact on move synchronization path

---

## 14) Backfill and Migration Strategy
Historical data must be projected once for continuity.

Migration path:
1. deploy projector + rules/indexes in shadow mode
2. run historical backfill
3. validate parity and shape quality
4. enable UI consumption
5. remove temporary fallback guards once stable

Key migration property:
- idempotent re-runs must be safe

---

## 15) Constraints and Restrictions
Known constraints in this design:
- eventual consistency between RTDB write and list row update
- invite-series granularity may hide rematch-level detail in list itself
- display snapshots can be stale until next relevant projector event
- list is not intended to be canonical historical analytics source

These are acceptable for v1 navigation goals.

---

## 16) Future Vision Alignment
This read model is designed to support future list scenarios without replacing core gameplay architecture:

Potential future list families:
- active games
- waiting for response
- recently ended
- high-priority/requires-attention
- archived/older history

Potential future capabilities:
- custom ranking logic via `listSortAt`
- richer event typing for row promotion
- denormalized opponent snapshots with refresh strategy
- paging + filtering without RTDB fan-out

This creates a clean path for broader game-list UX while preserving your realtime game engine model.

---

## 17) Rollout Path
### Phase A - Backend shadow
- enable projection writes
- no UI dependency yet

### Phase B - Historical fill
- run backfill and collect quality metrics

### Phase C - UI adoption
- `NavigationPicker` reads from profile game summaries
- keep current-login fallback path

### Phase D - Stabilization
- monitor parity/freshness
- reduce temporary guards

---

## 18) Validation Approach
Validation dimensions:
- functional correctness (visibility, ordering, status transitions)
- security correctness (ownership boundaries)
- migration correctness (backfill parity + idempotency)
- performance behavior (query latency + write volume)

---

## 19) Open Design Points for Iteration
These remain intentionally open for careful iteration:

1. Ranking policy detail:
- exactly which events should move rows up
- whether ranking differs for active vs ended rows

2. Latest-match context policy:
- whether displayed latest context should reflect proposed or mutually approved rematch progression

3. Retention policy:
- forever storage vs archival windows for ended series

4. Snapshot freshness policy:
- when to refresh opponent name/emoji snapshots beyond lifecycle events

---

## 20) Working Assumptions (Adjustable)
- one row per invite series is the right v1 unit
- RTDB remains gameplay source of truth
- eventual consistency in list UI is acceptable
- fallback current-login list is useful for partial identity states

These are working assumptions, not hard commitments, and can be revised as we iterate.
