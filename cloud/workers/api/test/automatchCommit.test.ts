import assert from "node:assert/strict";
import test from "node:test";
import { commitAutomatchWithLease } from "../src/automatch/commit.ts";
import { pendingAutomatchResponse } from "../src/automatch/plans.ts";
import { GameSessionMutationLeaseReleaseFailure } from "../src/gameSessionMutationRunner.ts";
import { createMemoryGameplayCoordinationStores } from "./gameplayCoordinationTestUtils.ts";

test("selection conflicts take precedence over a completed commit's release failure", async () => {
  const { mutationLocks } = createMemoryGameplayCoordinationStores();
  const response = pendingAutomatchResponse("auto_release_conflict");
  const releaseError = new Error("D1_ERROR: automatch-selection-stale");
  const calls: string[] = [];
  mutationLocks.release = async () => {
    calls.push("release");
    throw releaseError;
  };

  await assert.rejects(
    commitAutomatchWithLease(
      {
        inviteId: response.inviteId,
        leaseOperationId: "projection-request",
        prepare: async () => ({ response, changes: [] }),
        commit: async () => {
          calls.push("commit");
        },
        reconcile: async () => {
          assert.fail("known selection conflicts must bypass proof reads");
        },
        selectionConflict: "rethrow",
      },
      { mutationLocks },
    ),
    (error) => {
      assert.ok(error instanceof GameSessionMutationLeaseReleaseFailure);
      assert.equal(error.workCompleted, true);
      assert.equal(error.cause, releaseError);
      return true;
    },
  );
  assert.deepEqual(calls, ["commit", "release"]);
});

test("failed commit proof preserves the original error and wrapped work failures", async (t) => {
  for (const releaseFails of [false, true]) {
    await t.test(
      releaseFails ? "write and release fail" : "write fails",
      async () => {
        const { mutationLocks } = createMemoryGameplayCoordinationStores();
        const response = pendingAutomatchResponse("auto_unconfirmed");
        const writeError = new Error(
          releaseFails
            ? "D1_ERROR: automatch-selection-stale"
            : "unconfirmed-write",
        );
        const releaseError = new Error("release-unavailable");
        const calls: string[] = [];
        const release = mutationLocks.release;
        mutationLocks.release = async (lock, ownerId) => {
          calls.push("release");
          if (releaseFails) throw releaseError;
          await release(lock, ownerId);
        };

        await assert.rejects(
          commitAutomatchWithLease(
            {
              inviteId: response.inviteId,
              leaseOperationId: "projection-request",
              prepare: async () => ({ response, changes: [] }),
              commit: async () => {
                calls.push("commit");
                throw writeError;
              },
              reconcile: async (expected) => {
                calls.push("proof");
                assert.equal(expected, response);
                return false;
              },
              selectionConflict: "rethrow",
            },
            { mutationLocks },
          ),
          (error) => {
            if (releaseFails) {
              assert.ok(
                error instanceof GameSessionMutationLeaseReleaseFailure,
              );
              assert.equal(error.workCompleted, false);
              assert.equal(error.workError, writeError);
              assert.equal(error.cause, releaseError);
            } else {
              assert.equal(error, writeError);
            }
            return true;
          },
        );
        assert.deepEqual(calls, ["commit", "release", "proof"]);
      },
    );
  }
});
