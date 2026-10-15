import { env } from "cloudflare:workers";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createAuthProfileRepository,
  readAuthIdentityProfile,
} from "../src/authProfileRepository.ts";
import { AuthApiFailure } from "../src/authErrors.ts";
import { handleAuthRoute } from "../src/authRoutes.ts";
import { readCanonicalAuthProfileByLogin } from "../src/profileCanonical/authProfile.ts";
import {
  CanonicalProfileCorruption,
  commitCanonicalPlan,
  materializeCanonicalProfile,
  readCanonicalProfile,
  type CanonicalAuthMethodValue,
} from "../src/profileCanonicalD1.ts";
import { applyRetiredProfileMigrations } from "./profileTestMigrations.ts";

const testEnv = env as Env & { TEST_PROFILE_D1_MIGRATIONS: D1Migration[] };
const db = testEnv.PROFILE_DB;
const unlinked = { apple: false, eth: false, sol: false, x: false };
const validMethodValues = {
  apple: "apple-subject",
  eth: "0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD",
  sol: "11111111111111111111111111111111",
  x: "123456789",
};

async function createProfile(
  methods: Partial<Record<CanonicalAuthMethodValue["method"], string>> = {},
  username: string | null = null,
) {
  const profileId = `auth-methods-profile-${crypto.randomUUID()}`;
  const loginUid = `auth-methods-login-${crypto.randomUUID()}`;
  await commitCanonicalPlan(db, {
    expectations: [
      { kind: "profile-absent", profileId },
      { kind: "login-owner-absent", loginUid },
    ],
    mutations: [
      {
        kind: "insert-active-profile",
        value: materializeCanonicalProfile({
          profile: {
            id: profileId,
            nonce: 1,
            rating: 1500,
            totalManaPoints: 5,
            win: true,
            emoji: 2,
            username,
            eth: null,
            sol: null,
            completedProblemIds: [],
            isTutorialCompleted: false,
            mining: {
              lastRockDate: "2026-08-28",
              materials: { dust: 0, slime: 0, gum: 0, metal: 0, ice: 0 },
            },
          },
          createdAtMs: 1_000,
          updatedAtMs: 2_000,
        }),
      },
      {
        kind: "insert-login-owner",
        value: {
          loginUid,
          profileId,
          createdAtMs: 1_000,
          updatedAtMs: 2_000,
        },
      },
    ],
  });
  for (const [method, rawValue] of Object.entries(methods) as Array<
    [CanonicalAuthMethodValue["method"], string]
  >) {
    const normalizedValue = crypto.randomUUID();
    await commitCanonicalPlan(db, {
      expectations: [{ kind: "auth-method-absent", method, normalizedValue }],
      mutations: [
        {
          kind: "insert-auth-method",
          value: {
            method,
            normalizedValue,
            rawValue,
            profileId,
            appleEmailMasked: null,
            xUsername: null,
            linkedAtMs: null,
            consentAtMs: null,
            consentSource: null,
            createdAtMs: 2_000,
            updatedAtMs: 2_000,
          },
        },
      ],
    });
  }
  return { profileId, loginUid };
}

function observeDatabase(
  options: {
    mapRow?: (
      row: Record<string, unknown>,
      resultIndex: number,
    ) => Record<string, unknown>;
    mapResults?: (
      results: D1Result<Record<string, unknown>>[],
    ) => D1Result<Record<string, unknown>>[];
    failure?: Error;
  } = {},
) {
  const batchQueries: string[][] = [];
  const batchResults: D1Result<Record<string, unknown>>[][] = [];
  const nativeStatements = new WeakMap<object, D1PreparedStatement>();
  const statementQueries = new WeakMap<object, string>();
  const wrap = (
    statement: D1PreparedStatement,
    query: string,
  ): D1PreparedStatement => {
    const wrapped = new Proxy(statement, {
      get(target, property) {
        if (property === "bind") {
          return (...values: unknown[]) => wrap(target.bind(...values), query);
        }
        if (["all", "first", "run", "raw"].includes(String(property))) {
          return () => {
            throw new Error(`unexpected-auth-methods-${String(property)}`);
          };
        }
        const member = Reflect.get(target, property, target);
        return typeof member === "function" ? member.bind(target) : member;
      },
    });
    nativeStatements.set(wrapped, statement);
    statementQueries.set(wrapped, query);
    return wrapped;
  };
  const database = new Proxy(db, {
    get(target, property) {
      if (property === "prepare") {
        return (query: string) => wrap(target.prepare(query), query);
      }
      if (property === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          const queries = statements.map(
            (statement) => statementQueries.get(statement) || "",
          );
          batchQueries.push(queries);
          expect(queries).toHaveLength(2);
          for (const query of queries) expect(query).toMatch(/^\s*SELECT\b/);
          if (options.failure) throw options.failure;
          const results = await target.batch<Record<string, unknown>>(
            statements.map(
              (statement) => nativeStatements.get(statement) || statement,
            ),
          );
          batchResults.push(results);
          const mapped = results.map((result, index) => ({
            ...result,
            results: options.mapRow
              ? result.results.map((row) => options.mapRow!(row, index))
              : result.results,
          }));
          return options.mapResults ? options.mapResults(mapped) : mapped;
        };
      }
      if (property === "exec") {
        return () => {
          throw new Error("unexpected-auth-methods-exec");
        };
      }
      const member = Reflect.get(target, property, target);
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
  return { database, batchQueries, batchResults };
}

describe("canonical auth profile reads", () => {
  beforeAll(async () => {
    await applyRetiredProfileMigrations(
      db,
      testEnv.TEST_PROFILE_D1_MIGRATIONS,
      "c".repeat(64),
    );
  });

  it("returns the missing-login response in one batch", async () => {
    const observed = observeDatabase();
    await expect(
      createAuthProfileRepository(testEnv, {
        d1: observed.database,
      }).getLinkedAuthMethods("missing-auth-methods-login"),
    ).resolves.toEqual({
      ok: true,
      profileId: null,
      linkedMethods: unlinked,
      appleLinked: false,
    });
    expect(observed.batchQueries).toHaveLength(1);
  });

  it("retains owner, profile, and method revisions in the shared snapshot", async () => {
    const initial = await createProfile({ sol: validMethodValues.sol });
    const observed = observeDatabase();
    const result = await readCanonicalAuthProfileByLogin(
      observed.database,
      initial.loginUid,
    );
    expect(observed.batchQueries).toHaveLength(1);
    expect(result?.owner).toEqual({
      loginUid: initial.loginUid,
      profileId: initial.profileId,
      revision: 1,
      createdAtMs: 1_000,
      updatedAtMs: 2_000,
    });
    expect(result?.profile).toEqual(
      await readCanonicalProfile(db, initial.profileId),
    );
    expect(result?.authMethods).toEqual([
      expect.objectContaining({
        method: "sol",
        profileId: initial.profileId,
        revision: 1,
        rawValue: validMethodValues.sol,
      }),
    ]);
  });

  it("reads missing and complete identity profiles with one batch and no mutations", async () => {
    const profile = await createProfile({ sol: validMethodValues.sol });
    for (const loginUid of ["missing-identity-login", profile.loginUid]) {
      const observed = observeDatabase();
      const result = await readAuthIdentityProfile(observed.database, loginUid);
      expect(observed.batchQueries).toHaveLength(1);
      expect(observed.batchQueries[0].join("\n")).not.toMatch(
        /profile_auth_recovery_jobs|profile_february_opponents/,
      );
      if (loginUid !== profile.loginUid) {
        expect(result).toEqual({ ok: true, profile: null });
      } else {
        expect(result.profile).toMatchObject({
          id: profile.profileId,
          rating: 1500,
          nonce: 1,
          emoji: 2,
          mining: { materials: { dust: 0 } },
        });
        expect(JSON.stringify(result)).not.toMatch(
          /legacy_fields|auth_method|revision|normalized_value/,
        );
      }
    }
  });

  it("returns the complete profile once for four methods without rewriting retained fields", async () => {
    const profile = await createProfile(validMethodValues, "FourMethods");
    const legacyJson = JSON.stringify({ retained: "x".repeat(65_536) });
    await db
      .prepare(
        "UPDATE profile_records SET legacy_fields_json = ? WHERE profile_id = ?",
      )
      .bind(legacyJson, profile.profileId)
      .run();
    const before = await readCanonicalProfile(db, profile.profileId);
    const observed = observeDatabase();
    const snapshot = await readCanonicalAuthProfileByLogin(
      observed.database,
      profile.loginUid,
    );
    expect(snapshot?.profile).toEqual(before);
    expect(snapshot?.authMethods.map((method) => method.method)).toEqual([
      "apple",
      "eth",
      "sol",
      "x",
    ]);
    expect(observed.batchQueries).toHaveLength(1);
    const [profileResult, methodsResult] = observed.batchResults[0];
    expect(profileResult.results).toHaveLength(1);
    expect(profileResult.results[0].legacy_fields_json).toBe(legacyJson);
    expect(methodsResult.results).toHaveLength(4);
    for (const method of methodsResult.results) {
      expect(method).not.toHaveProperty("payload_json");
      expect(method).not.toHaveProperty("legacy_fields_json");
    }
    for (const result of observed.batchResults[0]) {
      expect(result.meta.rows_written).toBe(0);
    }
    expect(observed.batchQueries[0][0]).not.toContain("profile_auth_methods");
    expect(observed.batchQueries[0][1]).not.toContain("profile_records");
    await expect(readCanonicalProfile(db, profile.profileId)).resolves.toEqual(
      before,
    );
  });

  it.each([
    "missing",
    "extra",
    "failed",
    "invalid-results",
    "duplicate-profile",
    "missing-owner",
  ] as const)(
    "rejects %s batch results instead of returning a partial identity",
    async (failure) => {
      const profile = await createProfile({ sol: validMethodValues.sol });
      const observed = observeDatabase({
        mapResults: (results) => {
          const [profileResult, methodsResult] = results;
          switch (failure) {
            case "missing":
              return [profileResult];
            case "extra":
              return [...results, methodsResult];
            case "failed":
              return [
                profileResult,
                { ...methodsResult, success: false } as unknown as D1Result<
                  Record<string, unknown>
                >,
              ];
            case "invalid-results":
              return [
                profileResult,
                {
                  ...methodsResult,
                  results: null as unknown as Record<string, unknown>[],
                },
              ];
            case "duplicate-profile":
              return [
                {
                  ...profileResult,
                  results: [...profileResult.results, ...profileResult.results],
                },
                methodsResult,
              ];
            case "missing-owner":
              return [{ ...profileResult, results: [] }, methodsResult];
          }
        },
      });
      await expect(
        readAuthIdentityProfile(observed.database, profile.loginUid),
      ).rejects.toBeInstanceOf(CanonicalProfileCorruption);
      expect(observed.batchQueries).toHaveLength(1);
    },
  );

  it("requests username repair only for unnamed Apple or X profiles without wallets", async () => {
    for (const method of ["apple", "x"] as const) {
      const profile = await createProfile({
        [method]: validMethodValues[method],
      });
      const observed = observeDatabase();
      await expect(
        readAuthIdentityProfile(observed.database, profile.loginUid),
      ).rejects.toMatchObject({
        status: 409,
        code: "failed-precondition",
        message: "profile-repair-required",
      } satisfies Partial<AuthApiFailure>);
      expect(observed.batchQueries).toHaveLength(1);
    }
    for (const profile of [
      await createProfile({
        apple: validMethodValues.apple,
        sol: validMethodValues.sol,
      }),
      await createProfile({ apple: validMethodValues.apple }, "SeedName"),
      await createProfile(),
    ]) {
      const result = await readAuthIdentityProfile(db, profile.loginUid);
      expect(result).toMatchObject({
        ok: true,
        profile: { id: profile.profileId },
      });
      expect(JSON.stringify(result)).not.toContain(validMethodValues.apple);
    }
  });

  it("identity reads reject corrupt ownership instead of reporting a missing profile", async () => {
    const profile = await createProfile({ sol: validMethodValues.sol });
    for (const changes of [
      { profile_id: null, payload_json: null },
      { canonical_owner_login_uid: "another-login" },
      { canonical_owner_profile_id: "another-profile" },
      { state: "retiring", merged_into_profile_id: "target" },
      { canonical_merge_source_profile_id: "source" },
    ]) {
      const observed = observeDatabase({
        mapRow: (row, resultIndex) =>
          resultIndex === 0 ? { ...row, ...changes } : row,
      });
      await expect(
        readAuthIdentityProfile(observed.database, profile.loginUid),
      ).rejects.toBeInstanceOf(CanonicalProfileCorruption);
      expect(observed.batchQueries).toHaveLength(1);
    }
  });

  it("retains a profile with no linked methods", async () => {
    const profile = await createProfile();
    const observed = observeDatabase();
    await expect(
      createAuthProfileRepository(testEnv, {
        d1: observed.database,
      }).getLinkedAuthMethods(profile.loginUid),
    ).resolves.toEqual({
      ok: true,
      profileId: profile.profileId,
      linkedMethods: unlinked,
      appleLinked: false,
    });
    expect(observed.batchQueries).toHaveLength(1);
  });

  it.each([
    { methods: { apple: validMethodValues.apple }, flags: { apple: true } },
    { methods: { eth: validMethodValues.eth }, flags: { eth: true } },
    { methods: { sol: validMethodValues.sol }, flags: { sol: true } },
    { methods: { x: validMethodValues.x }, flags: { x: true } },
    {
      methods: validMethodValues,
      flags: { apple: true, eth: true, sol: true, x: true },
    },
    {
      methods: {
        apple: "short",
        eth: "0xinvalid",
        sol: "short",
        x: "user-name",
      },
      flags: unlinked,
    },
  ])(
    "derives flags from canonical raw values: $methods",
    async ({ methods, flags }) => {
      const profile = await createProfile(methods);
      const observed = observeDatabase();
      const linkedMethods = { ...unlinked, ...flags };
      await expect(
        createAuthProfileRepository(testEnv, {
          d1: observed.database,
        }).getLinkedAuthMethods(profile.loginUid),
      ).resolves.toEqual({
        ok: true,
        profileId: profile.profileId,
        linkedMethods,
        appleLinked: linkedMethods.apple,
      });
      expect(observed.batchQueries).toHaveLength(1);
      expect(observed.batchQueries[0].join("\n")).not.toMatch(
        /profile_auth_recovery_jobs|profile_february_opponents/,
      );
    },
  );

  it.each([
    ["dangling owner", 0, { profile_id: null, payload_json: null }],
    ["owner login mismatch", 0, { canonical_owner_login_uid: "another-login" }],
    [
      "owner profile mismatch",
      0,
      { canonical_owner_profile_id: "another-profile" },
    ],
    ["owner revision", 0, { canonical_owner_revision: 0 }],
    ["owner timestamp", 0, { canonical_owner_created_at_ms: -1 }],
    ["profile revision", 0, { revision: 0 }],
    ["profile payload", 0, { payload_json: "{}" }],
    ["legacy fields", 0, { legacy_fields_json: "[]" }],
    [
      "retiring profile",
      0,
      { state: "retiring", merged_into_profile_id: "target" },
    ],
    [
      "active merge mapping",
      0,
      { canonical_merge_source_profile_id: "source" },
    ],
    ["method name", 1, { method: "unsupported" }],
    ["method owner mismatch", 1, { profile_id: "another-profile" }],
    ["partial method row", 1, { method: null }],
    ["method raw value", 1, { raw_value: "" }],
    ["method revision", 1, { revision: 0 }],
    ["method metadata", 1, { apple_email_masked: "unexpected" }],
  ])(
    "rejects corrupt %s instead of returning an unlinked profile",
    async (_name, corruptedResultIndex, changes) => {
      const profile = await createProfile({ sol: validMethodValues.sol });
      const observed = observeDatabase({
        mapRow: (row, resultIndex) =>
          resultIndex === corruptedResultIndex ? { ...row, ...changes } : row,
      });
      await expect(
        createAuthProfileRepository(testEnv, {
          d1: observed.database,
        }).getLinkedAuthMethods(profile.loginUid),
      ).rejects.toBeInstanceOf(CanonicalProfileCorruption);
      expect(observed.batchQueries).toHaveLength(1);
    },
  );

  it("keeps the unavailable HTTP response for D1 read failures", async () => {
    const observed = observeDatabase({ failure: new Error("d1-unavailable") });
    const logFailure = vi.fn();
    const response = await handleAuthRoute(
      new Request("https://api.mons.link/auth/methods"),
      testEnv,
      { waitUntil() {} },
      {
        repository: createAuthProfileRepository(testEnv, {
          d1: observed.database,
        }),
        verifyIdentity: async () => ({ uid: "auth-methods-login" }),
        logFailure,
      },
    );
    expect(observed.batchQueries).toHaveLength(1);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "unavailable",
      message: "auth-service-unavailable",
    });
    expect(logFailure).toHaveBeenCalledWith("auth-service-unavailable");
  });
});
