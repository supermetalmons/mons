import assert from "node:assert/strict";
import test from "node:test";
import { createXAuthFlowController } from "../src/ui/identity/xAuthFlowController.ts";

const redirectStarted = Object.assign(new Error("redirect-started"), {
  code: "redirect-started",
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

const harness = ({
  source = "signin",
  pending = null,
  feedback = null,
  visible = true,
  dependencies = {},
  options = {},
  attach = true,
} = {}) => {
  const calls = [];
  const timers = new Map();
  const pendingListeners = new Set();
  const feedbackListeners = new Set();
  const visibilityListeners = new Set();
  let nextTimer = 0;
  const controller = createXAuthFlowController({
    consentSource: source,
    dependencies: {
      beginIntent: async () => {
        calls.push(["intent"]);
        return { intentId: "intent" };
      },
      startRedirect: async (params) => {
        calls.push(["redirect", params]);
        throw redirectStarted;
      },
      isRedirectStartedError: (error) => error === redirectStarted,
      formatError: (error, consentSource) =>
        `${consentSource}:${typeof error === "string" ? error : error.message}`,
      peekPendingResult: () => pending,
      subscribePendingResult: (listener) => {
        pendingListeners.add(listener);
        listener(pending);
        return () => pendingListeners.delete(listener);
      },
      clearPendingResult: () => {
        calls.push(["clear-pending"]);
        pending = null;
        pendingListeners.forEach((listener) => listener(pending));
      },
      consumeFeedback: () => {
        calls.push(["consume-feedback"]);
        const next = feedback;
        feedback = null;
        return next;
      },
      subscribeFeedback: (listener) => {
        feedbackListeners.add(listener);
        return () => feedbackListeners.delete(listener);
      },
      isVisible: () => visible,
      subscribeVisibility: (listener) => {
        visibilityListeners.add(listener);
        return () => visibilityListeners.delete(listener);
      },
      setTimeout: (callback, delay) => {
        const id = ++nextTimer;
        timers.set(id, { callback, delay });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
      ...dependencies,
    },
  });
  const callbacks = {
    authStatus: "unauthenticated",
    canStart: () => true,
    onStart: () => calls.push(["start"]),
    onError: (...args) => calls.push(["error", ...args]),
    onRedirectStarted: () => calls.push(["redirect-started"]),
    onSettled: (result) => calls.push(["settled", result]),
    onPendingSignIn: () => calls.push(["pending-signin"]),
    onSettingsReturn: () => calls.push(["settings-return"]),
    onFeedback: (value) => calls.push(["feedback", value]),
    ...options,
  };
  controller.setOptions(callbacks);
  const snapshots = [];
  controller.subscribe(() => snapshots.push(controller.getSnapshot()));
  if (attach) controller.attach();
  return {
    controller,
    calls,
    timers,
    snapshots,
    pendingListeners,
    feedbackListeners,
    visibilityListeners,
    setOptions: (next) => {
      Object.assign(callbacks, next);
      controller.setOptions({ ...callbacks });
    },
    emitPending: (next) => {
      pending = next;
      pendingListeners.forEach((listener) => listener(next));
    },
    emitFeedback: (next) => {
      if (feedbackListeners.size === 0) feedback = next;
      else feedbackListeners.forEach((listener) => listener(next));
    },
    setVisible: (next) => {
      visible = next;
      visibilityListeners.forEach((listener) => listener());
    },
    fireTimer: (delay) => {
      const entry = [...timers].find(([, value]) => value.delay === delay);
      assert.ok(entry, `expected timer with ${delay}ms delay`);
      timers.delete(entry[0]);
      entry[1].callback();
    },
  };
};

test("one sign-in action starts one redirect and retains connecting until recovery", async () => {
  const intent = deferred();
  const h = harness({ dependencies: { beginIntent: () => intent.promise } });
  const start = h.controller.start();
  await h.controller.start();
  assert.equal(h.controller.getSnapshot().buttonState, "connecting");
  assert.equal(h.calls.filter(([name]) => name === "start").length, 1);
  intent.resolve({ intentId: "one" });
  await start;
  await h.controller.start();
  assert.deepEqual(
    h.calls.filter(([name]) => name === "redirect"),
    [["redirect", { intentId: "one", consentSource: "signin" }]],
  );
  assert.equal(
    h.calls.some(([name]) => name === "error"),
    false,
  );
  assert.equal(h.controller.getSnapshot().buttonState, "connecting");
  h.fireTimer(1500);
  assert.equal(h.controller.getSnapshot().buttonState, "idle");
  assert.equal(h.timers.size, 0);
});

test("the caller's start gate prevents any auth work", async () => {
  const h = harness({ options: { canStart: () => false } });
  await h.controller.start();
  assert.deepEqual(h.calls, [["consume-feedback"]]);
  assert.equal(h.controller.getSnapshot().buttonState, "idle");
});

for (const source of ["signin", "settings"]) {
  for (const stage of ["intent", "redirect"]) {
    test(`${source} ${stage} failure preserves error and redirect-attempt metadata`, async () => {
      const error = new Error("cooldown");
      const h = harness({
        source,
        dependencies: {
          [stage === "intent" ? "beginIntent" : "startRedirect"]: async () => {
            throw error;
          },
        },
      });
      await h.controller.start();
      assert.equal(h.controller.getSnapshot().buttonState, "idle");
      assert.equal(h.timers.size, 0);
      assert.deepEqual(h.calls.slice(-2), [
        ["error", `${source}:cooldown`, error],
        ["settled", { redirectAttempted: stage === "redirect" }],
      ]);
    });
  }
}

test("settings clears busy after expected navigation without consuming return feedback", async () => {
  const h = harness({
    source: "settings",
    pending: { consentSource: "settings" },
    feedback: { target: "settings", kind: "error", message: "old" },
  });
  await h.controller.start();
  assert.deepEqual(h.calls, [
    ["start"],
    ["intent"],
    ["redirect", { intentId: "intent", consentSource: "settings" }],
    ["redirect-started"],
    ["settled", { redirectAttempted: true }],
  ]);
  assert.equal(h.controller.getSnapshot().buttonState, "idle");
  assert.equal(h.timers.size, 0);
  assert.equal(h.pendingListeners.size, 0);
  assert.equal(h.feedbackListeners.size, 0);
});

test("a hidden sign-in waits for visibility before navigation recovery", async () => {
  const h = harness({ visible: false });
  await h.controller.start();
  h.fireTimer(1500);
  assert.equal(h.controller.getSnapshot().buttonState, "connecting");
  assert.equal(h.visibilityListeners.size, 1);
  h.setVisible(false);
  assert.equal(h.controller.getSnapshot().buttonState, "connecting");
  h.setVisible(true);
  assert.equal(h.controller.getSnapshot().buttonState, "idle");
  assert.equal(h.visibilityListeners.size, 0);
});

test("navigation recovery leaves a pending sign-in callback in control", async () => {
  const h = harness();
  await h.controller.start();
  h.emitPending({ consentSource: "signin" });
  h.fireTimer(1500);
  assert.deepEqual(h.controller.getSnapshot(), {
    buttonState: "connecting",
    pendingSignIn: "waiting",
  });
  h.setOptions({ authStatus: "authenticated" });
  assert.equal(h.controller.getSnapshot().buttonState, "idle");
});

test("pending sign-in becomes retryable after 20 seconds and only retry clears it", () => {
  const h = harness({ pending: { consentSource: "signin" } });
  assert.equal(h.controller.getSnapshot().pendingSignIn, "waiting");
  assert.equal(h.calls.filter(([name]) => name === "pending-signin").length, 1);
  h.controller.retryPendingSignIn();
  assert.equal(
    h.calls.some(([name]) => name === "clear-pending"),
    false,
  );
  h.fireTimer(20_000);
  assert.equal(h.controller.getSnapshot().pendingSignIn, "stale");
  assert.equal(
    h.calls.some(([name]) => name === "clear-pending"),
    false,
  );
  h.controller.retryPendingSignIn();
  assert.equal(h.controller.getSnapshot().pendingSignIn, "none");
  assert.deepEqual(h.calls.slice(-2), [
    ["clear-pending"],
    ["error", "signin:x-redirect-complete-timeout"],
  ]);
  h.controller.retryPendingSignIn();
  assert.equal(h.calls.filter(([name]) => name === "clear-pending").length, 1);
});

test("completion and a newer pending callback invalidate older stale timers", () => {
  const h = harness({ pending: { consentSource: "signin" } });
  const oldTimer = [...h.timers.values()][0].callback;
  h.emitPending(null);
  assert.equal(h.timers.size, 0);
  oldTimer();
  assert.equal(h.controller.getSnapshot().pendingSignIn, "none");
  h.emitPending({ consentSource: "signin" });
  oldTimer();
  assert.equal(h.controller.getSnapshot().pendingSignIn, "waiting");
  h.fireTimer(20_000);
  assert.equal(h.controller.getSnapshot().pendingSignIn, "stale");
});

for (const feedbackFirst of [true, false]) {
  test(`settings return reopens once with feedback ${feedbackFirst ? "before" : "after"} result clearing`, () => {
    const feedback = { target: "settings", kind: "error", message: "failed" };
    const h = harness({ pending: { consentSource: "settings" } });
    if (feedbackFirst) h.emitFeedback(feedback);
    h.emitPending(null);
    if (!feedbackFirst) h.emitFeedback(feedback);
    h.emitPending(null);
    assert.deepEqual(
      h.calls.filter(
        ([name]) => name === "settings-return" || name === "feedback",
      ),
      feedbackFirst
        ? [["feedback", feedback], ["settings-return"]]
        : [["settings-return"], ["feedback", feedback]],
    );
  });
}

test("initial settings return is retained if it clears before subscriptions attach", () => {
  const h = harness({ pending: { consentSource: "settings" }, attach: false });
  h.emitPending(null);
  h.controller.attach();
  assert.equal(
    h.calls.filter(([name]) => name === "settings-return").length,
    1,
  );
});

test("strict lifecycle replay consumes initial feedback once and uses current callbacks", () => {
  const feedback = { target: "signin", kind: "error", message: "failed" };
  const h = harness({ feedback });
  h.controller.detach();
  h.controller.attach();
  h.controller.attach();
  assert.equal(h.pendingListeners.size, 1);
  assert.equal(h.feedbackListeners.size, 1);
  assert.equal(h.calls.filter(([name]) => name === "feedback").length, 1);
  const received = [];
  h.setOptions({ onFeedback: (value) => received.push(value) });
  h.emitFeedback(feedback);
  assert.deepEqual(received, [feedback]);
  h.controller.detach();
  assert.equal(h.pendingListeners.size, 0);
  assert.equal(h.feedbackListeners.size, 0);
});

test("detaching clears pending timers and visibility recovery, including queued callbacks", async () => {
  const h = harness({ visible: false });
  await h.controller.start();
  h.fireTimer(1500);
  const visibilityCallback = [...h.visibilityListeners][0];
  h.emitPending({ consentSource: "signin" });
  const timerCallback = [...h.timers.values()][0].callback;
  h.controller.detach();
  assert.equal(h.timers.size, 0);
  assert.equal(h.visibilityListeners.size, 0);
  const before = h.snapshots.length;
  visibilityCallback();
  timerCallback();
  assert.equal(h.snapshots.length, before);
});

test("an initiated redirect continues after detach without disturbing a newer action", async () => {
  const oldIntent = deferred();
  const newIntent = deferred();
  let attempts = 0;
  const h = harness({
    dependencies: {
      beginIntent: () =>
        ++attempts === 1 ? oldIntent.promise : newIntent.promise,
    },
  });
  const oldAction = h.controller.start();
  h.controller.detach();
  h.controller.attach();
  const newAction = h.controller.start();
  oldIntent.resolve({ intentId: "old" });
  await oldAction;
  assert.equal(h.controller.getSnapshot().buttonState, "connecting");
  assert.deepEqual(
    h.calls.filter(([name]) => name === "redirect"),
    [["redirect", { intentId: "old", consentSource: "signin" }]],
  );
  assert.equal(
    h.calls.some(([name]) => name === "redirect-started"),
    false,
  );
  assert.equal(
    h.calls.some(([name]) => name === "settled"),
    false,
  );
  assert.equal(h.timers.size, 0);
  newIntent.resolve({ intentId: "new" });
  await newAction;
  assert.deepEqual(
    h.calls.filter(([name]) => name === "redirect"),
    [
      ["redirect", { intentId: "old", consentSource: "signin" }],
      ["redirect", { intentId: "new", consentSource: "signin" }],
    ],
  );
});

test("late redirect completion after detach cannot report errors or schedule recovery", async () => {
  const redirect = deferred();
  const h = harness({
    dependencies: { startRedirect: () => redirect.promise },
  });
  const action = h.controller.start();
  await flush();
  h.controller.detach();
  const before = h.calls.length;
  redirect.reject(redirectStarted);
  await action;
  assert.equal(h.calls.length, before);
  assert.equal(h.timers.size, 0);
});

test("authentication cancels recovery while an initiated redirect can finish", async () => {
  const intent = deferred();
  const h = harness({ dependencies: { beginIntent: () => intent.promise } });
  const action = h.controller.start();
  h.setOptions({ authStatus: "authenticated" });
  intent.resolve({ intentId: "late" });
  await action;
  assert.deepEqual(
    h.calls.filter(([name]) => name === "redirect"),
    [["redirect", { intentId: "late", consentSource: "signin" }]],
  );
  assert.equal(
    h.calls.some(([name]) => name === "redirect-started"),
    false,
  );
  assert.equal(h.controller.getSnapshot().buttonState, "idle");

  const recovering = harness({ visible: false });
  await recovering.controller.start();
  recovering.fireTimer(1500);
  recovering.setOptions({ authStatus: "authenticated" });
  assert.equal(recovering.visibilityListeners.size, 0);
  assert.equal(recovering.controller.getSnapshot().buttonState, "idle");
});

test("a queued recovery from the previous attempt cannot reset a retry", async () => {
  const h = harness();
  await h.controller.start();
  const oldRecovery = [...h.timers.values()][0].callback;
  h.fireTimer(1500);
  await h.controller.start();
  oldRecovery();
  assert.equal(h.controller.getSnapshot().buttonState, "connecting");
  assert.equal(h.timers.size, 1);
});
