# plan.md - Game Navigation Roadmap and Design

## 1) Goal
Build a reliable game navigation experience where a player can quickly see and reopen their games, while preserving the current RTDB-first gameplay architecture.

This is a product/design plan, not a code-level spec.

---

## 2) What Must Work First

### 2.1 Core navigation outcome
- A player can open navigation and see their game list.
- Tapping a game opens that invite route and lets existing runtime logic recover the right board state.

### 2.2 Priority ordering behavior
- **Most important:** active games (not explicitly ended with `x`) stay on top.
- Ended games are below active games.

### 2.3 Coverage
- Include both direct-link invite games and automatch games.

### 2.4 Pending automatch visibility
- After starting automatch and returning to home, an item appears immediately in the list (pending/searching state).
- If automatch is canceled before acceptance, that pending item is removed.
- If automatch gets accepted, it stays as a normal persistent game item.

### 2.5 Identity fallback
- If profile-merged history is unavailable, show current-login-only fallback history (with clear messaging that scope is limited).

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
- Within each group, newest meaningful update first.

### 5.2 Near-future attention states
Potential attention states that may promote rows:
- outgoing wager proposal waiting for response
- pending automatch search row
- later: your-turn-now

### 5.3 “Your turn” caution
Your-turn ranking is intentionally delayed for careful iteration because:
- naive backend projection can cause high-frequency writes
- turn ownership depends on match-level state, not only invite-level state

Future-safe direction:
- keep base list lightweight
- add selective attention enrichment later with strict write controls

---

## 6) Row Content Strategy

### 6.1 V1 row density
- opponent emoji
- opponent display name
- type/status marker
- minimal invite context

### 6.2 Deliberately postponed row enrichments
- rematch count
- latest score / move count / current score
- deeper match stats in list cells

These can be added later once baseline list performance and correctness are stable.

---

## 7) Future Expansion Compatibility

This plan should support future list features without rethinking core architecture:

### 7.1 Additional item families
- tournaments in same navigation surface
- public recent automatch games browsing
- favorites/pinned boards
- local and bot sessions with cross-device resume semantics

### 7.2 Advanced engagement and analytics
- home/navigation badging for “needs attention”
- richer game analytics, piece usage, rating graphs

### 7.3 Compatibility principle
Keep the first list system simple but schema-extensible, so later item types and attention signals can be introduced with additive changes.

---

## 8) Constraints and Tradeoffs

Known constraints for the first version:
- eventual consistency between RTDB event and summary-list update
- invite-series granularity (not rematch-per-row)
- snapshot fields (name/emoji) may lag until refresh events
- fallback mode is current-login scope only, not fully merged profile history

These are acceptable for first release of reliable navigation.

---

## 9) Rollout Path

### Phase A - backend shadow
- build projection and security/index layer
- no UI switch yet

### Phase B - historical fill
- backfill old data
- validate quality and parity

### Phase C - UI activation
- show games in navigation
- keep fallback behavior

### Phase D - refinement
- add attention states (pending wager first)
- evaluate custom ranking logic
- expand item families when ready

---

## 10) Decisions We Should Lock Before Coding

1. **Ranking policy baseline**
- exact waiting-group order: pending automatch before normal waiting (recommended) vs same bucket

2. **Outgoing wager treatment**
- show as separate subsection vs badge within active rows in v1.1

3. **Latest-match context display policy**
- whether displayed rematch context should follow proposed progression or only mutually-approved progression

4. **Future item model boundary**
- keep first release as games-only list source with extension hooks (recommended), or generalize to multi-item-source storage immediately

5. **Local/bot cross-device resume target**
- when to define backend persistence requirements for local sessions (not needed for first release)

---

## 11) Working Principles for Iteration

- Prefer predictable behavior over maximal data richness in v1.
- Avoid backend writes tied to move-frequency events.
- Keep list fast and understandable.
- Add new ranking/badging logic only with explicit cost controls.
- Maintain compatibility with RTDB runtime recovery semantics.

