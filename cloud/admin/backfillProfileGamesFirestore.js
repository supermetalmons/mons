#!/usr/bin/env node
const admin = require("firebase-admin");
const { initAdmin } = require("./_admin");
const { recomputeInviteProjection } = require("../functions/profileGamesProjector");

const DEFAULT_LIST_SORT_BASELINE_MS = 1;
const DEFAULT_CONCURRENCY = 10;
const INVITES_PAGE_SIZE = 2000;

const parseNumberArg = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
};

const parseArgs = (argv) => {
  let dryRun = false;
  let limit = null;
  let sinceKey = null;
  let listSortBaselineMs = DEFAULT_LIST_SORT_BASELINE_MS;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--limit" && argv[i + 1]) {
      limit = parseNumberArg(argv[i + 1], null);
      i += 1;
      continue;
    }
    if (arg === "--since-key" && argv[i + 1]) {
      sinceKey = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--list-sort-baseline-ms" && argv[i + 1]) {
      listSortBaselineMs = parseNumberArg(argv[i + 1], DEFAULT_LIST_SORT_BASELINE_MS);
      i += 1;
      continue;
    }
    if (arg === "--project" && argv[i + 1]) {
      i += 1;
      continue;
    }
  }

  return {
    dryRun,
    limit,
    sinceKey,
    listSortBaselineMs,
  };
};

const processWithConcurrency = async (items, concurrency, worker) => {
  if (items.length === 0) {
    return;
  }
  let index = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const runners = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = index;
      index += 1;
      if (currentIndex >= items.length) {
        return;
      }
      await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(runners);
};

const listInviteIds = async (sinceKey, limit) => {
  const inviteIds = [];
  let cursor = sinceKey || null;

  while (true) {
    let invitesQuery = admin.database().ref("invites").orderByKey().limitToFirst(INVITES_PAGE_SIZE + 1);
    if (cursor) {
      invitesQuery = invitesQuery.startAt(cursor);
    }

    const invitesSnapshot = await invitesQuery.once("value");
    if (!invitesSnapshot.exists()) {
      break;
    }

    const pageInviteIds = Object.keys(invitesSnapshot.val() || {})
      .sort()
      .filter((inviteId) => !cursor || inviteId > cursor);

    if (pageInviteIds.length === 0) {
      break;
    }

    for (const inviteId of pageInviteIds) {
      inviteIds.push(inviteId);
      if (Number.isFinite(limit) && limit > 0 && inviteIds.length >= limit) {
        return inviteIds;
      }
    }

    cursor = pageInviteIds[pageInviteIds.length - 1];
    if (!cursor || pageInviteIds.length < INVITES_PAGE_SIZE) {
      break;
    }
  }

  return inviteIds;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!initAdmin()) {
    throw new Error("Failed to initialize Admin SDK with Application Default Credentials. Run gcloud auth application-default login.");
  }

  const inviteIds = await listInviteIds(options.sinceKey, options.limit);

  if (inviteIds.length === 0) {
    console.log("backfill-profile-games:no-invites", {
      sinceKey: options.sinceKey,
      limit: options.limit,
    });
    return;
  }

  let processed = 0;
  let failed = 0;
  let totalWrites = 0;
  let totalDeletes = 0;
  let totalSkipped = 0;

  await processWithConcurrency(inviteIds, DEFAULT_CONCURRENCY, async (inviteId, index) => {
    try {
      const result = await recomputeInviteProjection(inviteId, "backfill", {
        dryRun: options.dryRun,
        listSortAtMs: options.listSortBaselineMs,
        preserveNewerListSortAt: true,
        eventTimestampMs: Date.now(),
      });

      processed += 1;
      totalWrites += result && Number.isFinite(result.writes) ? result.writes : 0;
      totalDeletes += result && Number.isFinite(result.deletes) ? result.deletes : 0;
      totalSkipped += result && Number.isFinite(result.skipped) ? result.skipped : 0;

      if ((index + 1) % 100 === 0 || index === inviteIds.length - 1) {
        console.log("backfill-profile-games:progress", {
          processed,
          total: inviteIds.length,
          writes: totalWrites,
          deletes: totalDeletes,
          skipped: totalSkipped,
          dryRun: options.dryRun,
        });
      }
    } catch (error) {
      failed += 1;
      console.error("backfill-profile-games:error", {
        inviteId,
        error: error && error.message ? error.message : error,
      });
    }
  });

  console.log("backfill-profile-games:done", {
    dryRun: options.dryRun,
    processed,
    failed,
    total: inviteIds.length,
    writes: totalWrites,
    deletes: totalDeletes,
    skipped: totalSkipped,
    sinceKey: options.sinceKey,
    limit: options.limit,
    listSortBaselineMs: options.listSortBaselineMs,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
