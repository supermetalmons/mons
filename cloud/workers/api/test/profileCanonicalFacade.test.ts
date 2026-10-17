import assert from "node:assert/strict";
import test from "node:test";
import * as facade from "../src/profileCanonicalD1.ts";
import * as accounting from "../src/profileCanonical/accounting.ts";
import * as auth from "../src/profileCanonical/auth.ts";
import * as commit from "../src/profileCanonical/commit.ts";
import * as guards from "../src/profileCanonical/guards.ts";
import * as profiles from "../src/profileCanonical/profiles.ts";
import * as types from "../src/profileCanonical/types.ts";

test("the canonical profile facade preserves its exact public exports and identities", () => {
  const expected = {
    CANONICAL_PROFILE_REDIRECT_LIMIT: types.CANONICAL_PROFILE_REDIRECT_LIMIT,
    CANONICAL_PROFILE_INTERNAL_REDIRECT_LIMIT:
      types.CANONICAL_PROFILE_INTERNAL_REDIRECT_LIMIT,
    CANONICAL_PROFILE_LEADERBOARD_LIMIT:
      types.CANONICAL_PROFILE_LEADERBOARD_LIMIT,
    CanonicalProfileConflict: types.CanonicalProfileConflict,
    CanonicalProfileCorruption: types.CanonicalProfileCorruption,
    parseCanonicalControlRow: profiles.parseCanonicalControlRow,
    parseCanonicalPublicProfileRow: profiles.parseCanonicalPublicProfileRow,
    parseCanonicalProfileRow: profiles.parseCanonicalProfileRow,
    parseCanonicalLoginOwnerRow: auth.parseCanonicalLoginOwnerRow,
    parseCanonicalAuthMethodRow: auth.parseCanonicalAuthMethodRow,
    parseCanonicalMergeTargetRow: profiles.parseCanonicalMergeTargetRow,
    parseCanonicalAuthOperationRow: auth.parseCanonicalAuthOperationRow,
    parseCanonicalAuthRecoveryRow: auth.parseCanonicalAuthRecoveryRow,
    parseCanonicalRatingUpdateRow: accounting.parseCanonicalRatingUpdateRow,
    parseCanonicalWagerSettlementRow:
      accounting.parseCanonicalWagerSettlementRow,
    materializeCanonicalProfile: profiles.materializeCanonicalProfile,
    readCanonicalControl: profiles.readCanonicalControl,
    readCanonicalProfile: profiles.readCanonicalProfile,
    readCanonicalLoginOwner: auth.readCanonicalLoginOwner,
    readCanonicalAuthMethod: auth.readCanonicalAuthMethod,
    readCanonicalMergeTarget: profiles.readCanonicalMergeTarget,
    resolveCanonicalProfile: profiles.resolveCanonicalProfile,
    resolveCanonicalProfiles: profiles.resolveCanonicalProfiles,
    resolveCanonicalPublicProfile: profiles.resolveCanonicalPublicProfile,
    readCanonicalProfileByLogin: auth.readCanonicalProfileByLogin,
    readCanonicalPublicProfileByLogin: auth.readCanonicalPublicProfileByLogin,
    readCanonicalLeaderboard: profiles.readCanonicalLeaderboard,
    readCanonicalProfileAggregate: auth.readCanonicalProfileAggregate,
    readCanonicalProfileAggregates: auth.readCanonicalProfileAggregates,
    readCanonicalAuthRecoveryJob: auth.readCanonicalAuthRecoveryJob,
    readCanonicalProfileAggregateSnapshot:
      auth.readCanonicalProfileAggregateSnapshot,
    readCanonicalProfileAggregateSnapshots:
      auth.readCanonicalProfileAggregateSnapshots,
    readCanonicalProfileOwnershipSnapshot:
      auth.readCanonicalProfileOwnershipSnapshot,
    readCanonicalProfileAggregateByLogin:
      auth.readCanonicalProfileAggregateByLogin,
    readCanonicalAuthOperation: auth.readCanonicalAuthOperation,
    readCanonicalRatingUpdate: accounting.readCanonicalRatingUpdate,
    readCanonicalWagerSettlement: accounting.readCanonicalWagerSettlement,
    buildCanonicalGuardStatements: guards.buildCanonicalGuardStatements,
    commitCanonicalPlan: commit.commitCanonicalPlan,
  };
  assert.deepEqual(Object.keys(facade).sort(), Object.keys(expected).sort());
  for (const [name, value] of Object.entries(expected)) {
    assert.strictEqual(facade[name as keyof typeof facade], value, name);
  }
});

test("all canonical profile domains retain the same corruption error class", () => {
  for (const parse of [
    profiles.parseCanonicalProfileRow,
    auth.parseCanonicalAuthMethodRow,
    accounting.parseCanonicalRatingUpdateRow,
    accounting.parseCanonicalWagerSettlementRow,
  ]) {
    assert.throws(() => parse(null), facade.CanonicalProfileCorruption);
  }
});
