#!/usr/bin/env node
const fs = require("fs");
const { initAdmin, admin } = require("./_admin");

const normalizeEth = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
};

const normalizeSol = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  if (normalized.length < 20 || normalized.length > 64) {
    return "";
  }
  return normalized;
};

const normalizeAppleSub = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  return normalized.length >= 6 ? normalized : "";
};

const normalizeXUserId = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const normalized = value.trim();
  return /^\d+$/.test(normalized) ? normalized : "";
};

async function main() {
  if (!initAdmin()) {
    throw new Error("Failed to initialize Admin SDK.");
  }

  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outPath = outIdx !== -1 ? args[outIdx + 1] : "";

  const firestore = admin.firestore();
  const db = admin.database();
  const pageSize = 500;

  const ethOwners = new Map();
  const solOwners = new Map();
  const appleOwners = new Map();
  const xOwners = new Map();
  const loginToProfiles = new Map();
  const malformedEth = [];
  const malformedSol = [];
  const malformedApple = [];
  const malformedX = [];

  let totalProfiles = 0;
  let lastDoc = null;
  while (true) {
    let query = firestore
      .collection("users")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }
    snapshot.docs.forEach((doc) => {
      totalProfiles += 1;
      const profileId = doc.id;
      const data = doc.data() || {};

      const rawEth = typeof data.eth === "string" ? data.eth.trim() : "";
      const rawSol = typeof data.sol === "string" ? data.sol.trim() : "";
      const rawApple =
        typeof data.appleSub === "string" ? data.appleSub.trim() : "";
      const rawX = typeof data.xUserId === "string" ? data.xUserId.trim() : "";

      if (rawEth) {
        const normalizedEth = normalizeEth(rawEth);
        if (!normalizedEth) {
          malformedEth.push({ profileId, value: rawEth });
        } else {
          const owners = ethOwners.get(normalizedEth) || [];
          owners.push(profileId);
          ethOwners.set(normalizedEth, owners);
        }
      }
      if (rawSol) {
        const normalizedSol = normalizeSol(rawSol);
        if (!normalizedSol) {
          malformedSol.push({ profileId, value: rawSol });
        } else {
          const owners = solOwners.get(normalizedSol) || [];
          owners.push(profileId);
          solOwners.set(normalizedSol, owners);
        }
      }
      if (rawApple) {
        const normalizedApple = normalizeAppleSub(rawApple);
        if (!normalizedApple) {
          malformedApple.push({ profileId, value: rawApple });
        } else {
          const owners = appleOwners.get(normalizedApple) || [];
          owners.push(profileId);
          appleOwners.set(normalizedApple, owners);
        }
      }
      if (rawX) {
        const normalizedX = normalizeXUserId(rawX);
        if (!normalizedX) {
          malformedX.push({ profileId, value: rawX });
        } else {
          const owners = xOwners.get(normalizedX) || [];
          owners.push(profileId);
          xOwners.set(normalizedX, owners);
        }
      }

      const logins = Array.isArray(data.logins) ? data.logins : [];
      logins.forEach((loginUid) => {
        if (typeof loginUid !== "string" || loginUid.trim() === "") {
          return;
        }
        const owners = loginToProfiles.get(loginUid) || [];
        owners.push(profileId);
        loginToProfiles.set(loginUid, owners);
      });
    });

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < pageSize) {
      break;
    }
  }

  const duplicateEth = [];
  const duplicateSol = [];
  const duplicateApple = [];
  const duplicateX = [];
  ethOwners.forEach((profileIds, eth) => {
    if (profileIds.length > 1) {
      duplicateEth.push({ eth, profileIds });
    }
  });
  solOwners.forEach((profileIds, sol) => {
    if (profileIds.length > 1) {
      duplicateSol.push({ sol, profileIds });
    }
  });
  appleOwners.forEach((profileIds, appleSub) => {
    if (profileIds.length > 1) {
      duplicateApple.push({ appleSub, profileIds });
    }
  });
  xOwners.forEach((profileIds, xUserId) => {
    if (profileIds.length > 1) {
      duplicateX.push({ xUserId, profileIds });
    }
  });

  const conflictingLogins = [];
  loginToProfiles.forEach((profileIds, loginUid) => {
    const uniqueProfiles = Array.from(new Set(profileIds));
    if (uniqueProfiles.length > 1) {
      conflictingLogins.push({ loginUid, profileIds: uniqueProfiles });
    }
  });

  const loginProfileLinkMismatches = [];
  const loginUids = Array.from(loginToProfiles.keys());
  for (const loginUid of loginUids) {
    const expectedProfiles = Array.from(
      new Set(loginToProfiles.get(loginUid) || []),
    );
    const expectedProfile =
      expectedProfiles.length === 1 ? expectedProfiles[0] : null;
    if (!expectedProfile) {
      continue;
    }
    let rtdbProfile = null;
    try {
      const snapshot = await db
        .ref(`players/${loginUid}/profile`)
        .once("value");
      const value = snapshot.val();
      if (typeof value === "string" && value.trim() !== "") {
        rtdbProfile = value.trim();
      }
    } catch {}
    if (rtdbProfile !== expectedProfile) {
      loginProfileLinkMismatches.push({
        loginUid,
        expectedProfile,
        rtdbProfile,
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalProfiles,
    totalLogins: loginToProfiles.size,
    malformedEthCount: malformedEth.length,
    malformedSolCount: malformedSol.length,
    malformedAppleCount: malformedApple.length,
    malformedXCount: malformedX.length,
    duplicateEthCount: duplicateEth.length,
    duplicateSolCount: duplicateSol.length,
    duplicateAppleCount: duplicateApple.length,
    duplicateXCount: duplicateX.length,
    conflictingLoginsCount: conflictingLogins.length,
    loginProfileLinkMismatchesCount: loginProfileLinkMismatches.length,
    malformedEth,
    malformedSol,
    malformedApple,
    malformedX,
    duplicateEth,
    duplicateSol,
    duplicateApple,
    duplicateX,
    conflictingLogins,
    loginProfileLinkMismatches,
  };

  console.log("Auth preflight audit summary:");
  console.log(
    JSON.stringify(
      {
        totalProfiles: report.totalProfiles,
        totalLogins: report.totalLogins,
        malformedEthCount: report.malformedEthCount,
        malformedSolCount: report.malformedSolCount,
        malformedAppleCount: report.malformedAppleCount,
        malformedXCount: report.malformedXCount,
        duplicateEthCount: report.duplicateEthCount,
        duplicateSolCount: report.duplicateSolCount,
        duplicateAppleCount: report.duplicateAppleCount,
        duplicateXCount: report.duplicateXCount,
        conflictingLoginsCount: report.conflictingLoginsCount,
        loginProfileLinkMismatchesCount: report.loginProfileLinkMismatchesCount,
      },
      null,
      2,
    ),
  );

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`Wrote detailed report to ${outPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
