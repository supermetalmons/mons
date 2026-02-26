# plan.md - Game Navigation Roadmap and Design

## 1) Goal
Build a reliable game navigation experience where a player can quickly see and reopen their games, while preserving the current RTDB-first gameplay architecture.

This is a product/design plan, not a code-level spec.

---

## 2) What Must Work First

### 2.1 Core navigation outcome
- A player can open navigation and see their game list.
- Tapping a game opens that invite route and lets existing runtime logic recover board/match state.
- Navigation target for list rows is invite path (`/{inviteId}`), not precomputed match path.

### 2.2 Priority ordering behavior
- **Most important:** active games (not explicitly ended with `x`) stay on top.
- Ended games are below active games.

### 2.3 Coverage
- Include both direct-link invite games and automatch games.

### 2.4 Pending automatch visibility
- After starting automatch and returning to home, an item appears immediately in the list (pending/searching state).
- Pending automatch visibility is queue-based, not invite-based:
  - show pending only while `automatch/{inviteId}` exists
  - if queue entry is removed and no guest joined, remove row from list
  - if guest joined, keep row as persistent game item

### 2.5 Identity fallback
- If profile-merged history is unavailable, show current-login-only fallback history (with clear messaging that scope is limited).

### 2.6 Signed-in preservation
- Legacy games played on old login UIDs must become visible after wallet/profile linking.
- Linking must not “lose” prior game history in the new profile list.

---

## 3) UX Structure Direction

Navigation popup should evolve into a unified control with three content zones:

1. **Learning zone**
- If tutorial is incomplete, uncompleted lessons are shown above all other content.
- If tutorial is complete, lessons remain reachable from the same popup as similar items.

2. **Games zone**
- Main game list (active first, then waiting, then ended).
- Compact cell with opponent emoji + name and minimal status context.

3. **Actions zone**
- New game actions directly in popup (bot, direct invite, automatch), especially when outside home board.

This keeps player flow centered in one place instead of forcing a home-board detour.

---

## 4) Data/Architecture Direction

Use a read-model pattern:
- RTDB remains the source of truth for invites, rematches, gameplay, and realtime move state.
- Firestore stores a profile-scoped summary list optimized for fast read and sorting.
- All projector triggers call a single shared recompute pipeline per invite to keep behavior deterministic and safe.

This gives:
- fast list rendering
- low query fan-out
- stable path for future list growth

without changing game runtime behavior.

---

## 5) Sorting and Attention Model (Now vs Later)

### 5.1 V1 sorting
- Active first.
- Waiting next.
- Ended last.
- Pending automatch rows are ranked above normal waiting rows.
- Within each group, newest meaningful update first.

### 5.2 Backfill ordering policy
- Historical backfill rows should not jump above newly active rows by accident.
- Backfilled `listSortAt` uses a low baseline timestamp policy (old/neutral rank), then normal projector updates move rows up as fresh events occur.

### 5.3 Near-future attention states
Potential attention states that may promote rows:
- outgoing wager proposal waiting for response
- pending automatch search row
- later: your-turn-now

### 5.4 “Your turn” caution
Your-turn ranking is intentionally delayed for careful iteration because:
- naive backend projection can cause high-frequency writes
- turn ownership depends on match-level state, not only invite-level state

Future-safe direction:
- keep base list lightweight
- add selective attention enrichment later with strict write controls

---

## 6) Projection Scope and Noise Control

### 6.1 Trigger scope
Projector is driven by invite lifecycle, match creation, automatch queue changes, and profile-link catch-up events.

### 6.2 Noise suppression
- Reaction churn must not drive list projection.
- Wager-derived ranking/badging is deferred for now.
- Invite updates that only touch ignored fields should skip recompute/writes.

### 6.3 Reactions model decision
- Keep reactions under invite model for now.
- Do not move reactions out in this iteration; first ship with projector filtering and write suppression.
- Revisit structural move only if production trigger volume still becomes a problem.

---

## 7) Identity and Linking Behavior

- Profile list is ownership-scoped by profile ID, but source game data is login-UID scoped.
- When `players/{loginUid}/profile` is established for a legacy login, run catch-up projection for that login’s historical invites.
- Fallback behavior remains current-login-only if profile history is not yet available.

---

## 8) Row Content Strategy

### 8.1 V1 row density
- opponent emoji
- opponent display name
- type/status marker
- minimal invite context

### 8.2 Deliberately postponed row enrichments
- rematch count
- latest score / move count / current score
- deeper match stats in list cells

These can be added later once baseline list performance and correctness are stable.

---

## 9) Future Expansion Compatibility

This plan should support future list features without rethinking core architecture:

### 9.1 Additional item families
- tournaments in same navigation surface
- public recent automatch games browsing
- favorites/pinned boards
- local and bot sessions with cross-device resume semantics

### 9.2 Advanced engagement and analytics
- home/navigation badging for “needs attention”
- richer game analytics, piece usage, rating graphs

### 9.3 Compatibility principle
- First release remains games-focused.
- Data shape should stay extensible (`entityType`, additive fields) so mixed-item navigation can be added without a rewrite.

---

## 10) Constraints and Tradeoffs

Known constraints for the first version:
- eventual consistency between RTDB events and summary-list update
- invite-series granularity (not rematch-per-row)
- snapshot fields (name/emoji) may lag until refresh events
- fallback mode is current-login scope only, not fully merged profile history

These are acceptable for first release of reliable navigation.

---

## 11) Rollout Path

### Phase A - backend shadow
- build projection + filtering + security/index layer
- include profile-link catch-up path
- no UI switch yet

### Phase B - historical fill
- backfill old data with locked ordering policy
- validate quality and parity

### Phase C - UI activation
- show games in navigation
- add optimistic pending-automatch local row
- keep fallback behavior

### Phase D - refinement
- add attention states (pending wager first)
- evaluate custom ranking logic
- expand item families when ready

---

## 12) Current Defaults Chosen

- Pending automatch visibility is queue-based.
- Row navigation opens invite route only.
- Shared recompute projector is used for all relevant triggers.
- Reactions and wager changes are ignored by v1 list ranking/projection logic.
- Backfill uses low-baseline sort ordering for historical rows.
- Legacy login histories are projected into profile list after linking.

---

## 13) Working Principles for Iteration

- Prefer predictable behavior over maximal data richness in v1.
- Avoid backend writes tied to move-frequency events.
- Keep list fast and understandable.
- Add new ranking/badging logic only with explicit cost controls.
- Maintain compatibility with RTDB runtime recovery semantics.
