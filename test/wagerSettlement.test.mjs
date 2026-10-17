import assert from "node:assert/strict";
import test from "node:test";
import {
  createWagerClientHarness,
  deferred,
  flush,
} from "./wagerClientHarness.mjs";

const materials = { dust: 8, slime: 0, gum: 0, metal: 0, ice: 0 };
const response = { ok: true, mining: { materials, lastRockDate: null } };
const agreedState = {
  agreed: {
    material: "dust",
    count: 3,
    total: 6,
    proposerId: "actor",
    accepterId: "opponent",
  },
};

function harness() {
  const h = createWagerClientHarness();
  const pending = deferred();
  const requests = [];
  h.dependencies.api.resolveWagerOutcomeViaApi = async (request, provider) => {
    await provider(false);
    provider.assertCurrentUser();
    requests.push(request);
    const value = await pending.promise;
    provider.assertCurrentUser();
    return value;
  };
  h.observe({ finished: agreedState });
  h.client.observeMiningFrozen("actor");
  return {
    ...h,
    instance: h.client,
    poller: h.events.pollers[0],
    pending,
    requests,
    inventory: h.events.inventory,
    get optimistic() {
      return h.events.states
        .filter(({ state }) => state?.resolved?.optimistic)
        .map(({ matchId }) => matchId);
    },
    banners: h.events.banners,
    refreshes: () => h.events.refreshes,
    setProfile: (value) => {
      h.session.profileId = value;
    },
    rematch: () => {
      h.session.activeContext = {
        ...h.session.activeContext,
        contextId: 2,
        matchId: "rematch",
      };
      h.client.bindContext(h.session.activeContext);
      h.client.updateWagerStateForCurrentMatch();
    },
  };
}

test("a rematch cannot discard the finished match's settlement or inventory", async (t) => {
  const h = harness();
  t.after(() => h.poller.stop());
  const result = h.instance.resolveWagerOutcome(true);
  await flush();
  h.rematch();
  h.pending.resolve(response);
  assert.deepEqual(await result, response);
  assert.deepEqual(h.requests, [{ inviteId: "invite", matchId: "finished" }]);
  assert.deepEqual(h.inventory, [response.mining]);
  assert.deepEqual(h.optimistic, ["finished"]);
  assert.equal(h.refreshes(), 1);
});

test("settlement starts even while another wager mutation is pending", async (t) => {
  const h = harness();
  t.after(() => h.poller.stop());
  const prior = deferred();
  const mutation = h.poller.runMutation(() => prior.promise, {
    isCurrent: () => true,
  });
  await flush();
  const result = h.instance.resolveWagerOutcome(true);
  await flush();
  assert.equal(h.requests.length, 1);
  h.rematch();
  h.pending.resolve(response);
  assert.deepEqual(await result, response);
  assert.deepEqual(h.inventory, [response.mining]);
  prior.resolve();
  await mutation;
});

test("captures the finished match before authentication yields", async (t) => {
  const h = harness();
  t.after(() => h.poller.stop());
  const authentication = deferred();
  h.dependencies.ensureAuthenticated = () => authentication.promise;
  const result = h.instance.resolveWagerOutcome(true);
  h.rematch();
  authentication.resolve();
  h.pending.resolve(response);
  await result;
  assert.deepEqual(h.requests, [{ inviteId: "invite", matchId: "finished" }]);
  assert.deepEqual(h.inventory, [response.mining]);
  assert.deepEqual(h.optimistic, []);
});

test("settlement completes after navigation without replacing newer inventory", async (t) => {
  const h = harness();
  t.after(() => h.poller.stop());
  const result = h.instance.resolveWagerOutcome(true);
  await flush();
  h.session.epoch++;
  h.session.activeContext = null;
  h.session.actorUid = null;
  const newerInventory = {
    materials: { ...materials, dust: 12 },
    lastRockDate: "2026-09-05",
  };
  h.inventory.push(newerInventory);
  h.pending.resolve(response);
  assert.deepEqual(await result, response);
  assert.deepEqual(h.requests, [{ inviteId: "invite", matchId: "finished" }]);
  assert.deepEqual(h.inventory, [newerInventory]);
});

test("settlement cannot replace inventory after the active invite changes within the same session", async (t) => {
  const h = harness();
  t.after(() => h.poller.stop());
  const result = h.instance.resolveWagerOutcome(true);
  await flush();
  h.session.activeContext = {
    ...h.session.activeContext,
    contextId: 2,
    inviteId: "other-invite",
  };
  h.pending.resolve(response);
  assert.deepEqual(await result, response);
  assert.deepEqual(h.requests, [{ inviteId: "invite", matchId: "finished" }]);
  assert.deepEqual(h.inventory, []);
});

test("account and profile changes cannot receive an old inventory response", async (t) => {
  for (const change of [
    (h) => {
      h.session.auth.currentUser = {
        uid: "other",
        getIdToken: async () => "other-token",
      };
    },
    (h) => h.setProfile("other-profile"),
  ]) {
    const h = harness();
    t.after(() => h.poller.stop());
    const result = h.instance.resolveWagerOutcome(true);
    await flush();
    change(h);
    h.pending.resolve(response);
    await result;
    assert.deepEqual(h.inventory, []);
    assert.equal(h.refreshes(), 0);
  }
});

test("an account switch during authentication never sends the old settlement", async (t) => {
  const h = harness();
  t.after(() => h.poller.stop());
  const authentication = deferred();
  h.dependencies.ensureAuthenticated = () => authentication.promise;
  const result = h.instance.resolveWagerOutcome(true);
  h.session.auth.currentUser = {
    uid: "other",
    getIdToken: async () => "other-token",
  };
  authentication.resolve();
  assert.deepEqual(await result, { ok: false });
  assert.deepEqual(h.requests, []);
});

test("failed settlement refreshes balances without restoring a new match's UI", async (t) => {
  const h = harness();
  t.after(() => h.poller.stop());
  const result = h.instance.resolveWagerOutcome(true);
  const rejected = assert.rejects(result, /reload-required/);
  await flush();
  h.rematch();
  h.pending.reject(
    Object.assign(new Error("reload-required"), {
      code: "client-update-required",
    }),
  );
  await rejected;
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.instance.wagers.finished.agreed, agreedState.agreed);
  assert.equal(h.instance.wagers.finished.resolved, undefined);
  assert.equal(h.events.states.at(-1).matchId, "rematch");
  assert.equal(h.events.states.at(-1).state, null);
  assert.equal(h.banners.length, 1);
  assert.equal(h.refreshes(), 1);
});
