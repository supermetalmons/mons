import assert from "node:assert/strict";
import test from "node:test";
import { storage } from "../src/utils/storage.ts";
import { bindProfileCosmeticStorage } from "./fixtures/profileCosmeticStorageHarness.mjs";

const previousLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
const values = new Map();
const reads = [];
const writes = [];
const localStorage = {
  getItem: (key) => {
    reads.push(key);
    return values.get(key) ?? null;
  },
  removeItem: (key) => {
    writes.push(key);
    values.delete(key);
  },
  setItem: (key, value) => {
    writes.push(key);
    values.set(key, String(value));
  },
};
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorage,
});
const createProfileCosmeticWrites = bindProfileCosmeticStorage(
  storage,
  localStorage,
);
const cosmeticKeys = [
  "cardBackgroundId",
  "cardStickers",
  "cardSubtitleId",
  "profileCounter",
  "profileMons",
];

test.beforeEach(() => {
  values.clear();
  reads.length = 0;
  writes.length = 0;
});
test.after(() => {
  if (previousLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", previousLocalStorage);
  } else {
    delete globalThis.localStorage;
  }
});

test("cosmetic descriptors are lazy and retain raw storage baselines", () => {
  const rawStickers = '{ "mana": "blue-mana" }';
  values.set("cardStickers", rawStickers);
  const fields = createProfileCosmeticWrites({ cardBackgroundId: 0 });
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, []);

  values.set("cardBackgroundId", "7");
  assert.deepEqual(
    fields.map((field) => field.read()),
    ["7", rawStickers, null, null, null],
  );
  assert.deepEqual(reads, cosmeticKeys);
  assert.deepEqual(writes, []);
});

test("authoritative cosmetics persist zero and empty values and remove omitted fields", () => {
  for (const cosmetics of [
    {
      cardBackgroundId: 0,
      cardStickers: "",
      cardSubtitleId: 0,
      profileCounter: "gp",
      profileMons: "",
    },
    {},
  ]) {
    cosmeticKeys.forEach((key) => values.set(key, "stale"));
    values.set("profileId", "owner");
    values.set("playerRating", "1777");
    writes.length = 0;
    createProfileCosmeticWrites(cosmetics).forEach((field) => field.write());
    assert.deepEqual(writes, cosmeticKeys);
    for (const key of cosmeticKeys) {
      assert.equal(
        values.get(key),
        key in cosmetics ? String(cosmetics[key]) : undefined,
      );
    }
    assert.equal(values.get("profileId"), "owner");
    assert.equal(values.get("playerRating"), "1777");
  }
});

test("emoji storage preserves numeric and string representations without normalization", () => {
  assert.equal(storage.getPlayerEmojiId("missing"), "missing");
  for (const [input, serialized, restored] of [
    [1009, "1009", 1009],
    ["1009", "1009", 1009],
    ["001", "001", "001"],
    ["legacy-emoji", "legacy-emoji", "legacy-emoji"],
  ]) {
    storage.setPlayerEmojiId(input);
    assert.equal(values.get("playerEmojiId"), serialized);
    assert.equal(storage.getPlayerEmojiId("missing"), restored);
  }
  values.set("playerEmojiId", JSON.stringify("1009"));
  assert.equal(storage.getPlayerEmojiId("missing"), "1009");
});
