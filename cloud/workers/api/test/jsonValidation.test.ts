import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeValue,
  validateAutomatchJson,
} from "../src/automatchD1/codec.ts";
import { validateStoredJson } from "../src/jsonValidation.ts";

function nestedValue(depth: number): unknown {
  let value: unknown = 0;
  for (let index = 0; index < depth; index++) value = { value };
  return value;
}

for (const { name, validate, errorMessage } of [
  {
    name: "stored JSON",
    validate: (value: unknown) => validateStoredJson(value, "invalid-stored"),
    errorMessage: "invalid-stored",
  },
  {
    name: "automatch JSON",
    validate: validateAutomatchJson,
    errorMessage: "invalid-automatch-json",
  },
]) {
  test(`${name} accepts stored primitives and shared references without mutation`, () => {
    const shared = Object.freeze({ count: 3 });
    const nullPrototype = { retained: null, shared };
    Object.setPrototypeOf(nullPrototype, null);
    const value = Object.freeze({
      first: shared,
      second: shared,
      nullPrototype: Object.freeze(nullPrototype),
      values: Object.freeze([null, true, false, "", 0, -0, 1.5]),
    });
    assert.doesNotThrow(() => validate(value));
    assert.strictEqual(value.first, value.second);
    assert.strictEqual(Object.getPrototypeOf(value.nullPrototype), null);
    for (const primitive of value.values) {
      assert.doesNotThrow(() => validate(primitive));
    }
  });

  test(`${name} retains its exact error for invalid values and cycles`, () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const arrayCycle: unknown[] = [];
    arrayCycle.push(arrayCycle);
    for (const value of [
      undefined,
      NaN,
      Infinity,
      -Infinity,
      1n,
      Symbol("invalid"),
      () => null,
      new Date(0),
      Object.create({ inherited: true }),
      cycle,
      arrayCycle,
    ]) {
      assert.throws(() => validate(value), {
        name: "TypeError",
        message: errorMessage,
      });
      assert.throws(() => validate({ nested: value }), {
        name: "TypeError",
        message: errorMessage,
      });
    }
  });

  test(`${name} keeps the depth boundary at 64 including primitive leaves`, () => {
    assert.doesNotThrow(() => validate(nestedValue(64)));
    assert.throws(() => validate(nestedValue(65)), {
      name: "TypeError",
      message: errorMessage,
    });
  });

  test(`${name} preserves sparse arrays and own enumerable traversal`, () => {
    const sparse = new Array(3);
    sparse[1] = true;
    const inherited = Object.create(Array.prototype);
    inherited[0] = undefined;
    Object.setPrototypeOf(sparse, inherited);
    Object.defineProperty(sparse, "hidden", { value: undefined });
    Object.assign(sparse, { [Symbol("ignored")]: undefined });
    assert.doesNotThrow(() => validate(sparse));
    assert.equal(Object.hasOwn(sparse, 0), false);
    Object.assign(sparse, { extra: undefined });
    assert.throws(() => validate(sparse), {
      name: "TypeError",
      message: errorMessage,
    });
  });

  test(`${name} propagates getter failures unchanged`, () => {
    const failure = new Error("getter-failed");
    const value = {
      get nested(): unknown {
        throw failure;
      },
    };
    assert.throws(
      () => validate(value),
      (error) => error === failure,
    );
  });
}

test("automatch encoding preserves JSON.stringify output and SQL null", () => {
  const sparse = new Array(3);
  sparse[1] = { z: 2, a: 1 };
  const value = { retained: null, empty: {}, sparse };
  Object.setPrototypeOf(value, null);
  assert.equal(encodeValue(null), null);
  assert.equal(
    encodeValue(value),
    '{"retained":null,"empty":{},"sparse":[null,{"z":2,"a":1},null]}',
  );
  assert.throws(() => encodeValue({ invalid: undefined }), {
    name: "TypeError",
    message: "invalid-automatch-json",
  });
});
