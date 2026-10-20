"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const withdrawalPath = path.resolve(
  __dirname,
  "../runtime/eventPrizes/withdrawalOrchestrator.js",
);
const assignmentValidationPath = path.resolve(
  __dirname,
  "../runtime/eventPrizes/assignmentValidation.js",
);

test("preserves the withdrawal orchestrator prize assignment validator export", () => {
  assert.equal(
    require(withdrawalPath).validatePrizeAssignment,
    require(assignmentValidationPath).validatePrizeAssignment,
  );
});

test("loads prize assignment validation without execution modules", () => {
  const executionPaths = [
    "assets.js",
    "solana.js",
    "submissionRecovery.js",
    "submittedTransactions.js",
    "withdrawalOrchestrator.js",
  ].map((filename) => path.join(path.dirname(withdrawalPath), filename));
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
        require(${JSON.stringify(assignmentValidationPath)});
        const forbidden = new Set(${JSON.stringify(executionPaths)});
        const loaded = Object.keys(require.cache).filter((modulePath) =>
          forbidden.has(modulePath) ||
          modulePath.includes("/node_modules/@metaplex-foundation/") ||
          modulePath.includes("/node_modules/@solana/web3.js/")
        );
        if (loaded.length > 0) throw new Error(loaded.join("\\n"));
      `,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("keeps withdrawal orchestration independent of eager Solana SDK loading", () => {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
        require(${JSON.stringify(withdrawalPath)});
        const loaded = Object.keys(require.cache).filter((modulePath) =>
          modulePath.includes("/node_modules/@metaplex-foundation/") ||
          modulePath.includes("/node_modules/@solana/web3.js/")
        );
        if (loaded.length > 0) throw new Error(loaded.join("\\n"));
      `,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
