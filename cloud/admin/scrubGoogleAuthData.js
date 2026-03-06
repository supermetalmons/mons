#!/usr/bin/env node
const fs = require("fs");
const { initAdmin, admin } = require("./_admin");

const GOOGLE_USER_FIELDS = [
  "googleSub",
  "googleEmailMasked",
  "googleLinkedAt",
  "googleConsentAt",
  "googleConsentSource",
];

const toCleanString = (value) => (typeof value === "string" && value.trim() !== "" ? value.trim() : "");

const hasGoogleFields = (data) => {
  return GOOGLE_USER_FIELDS.some((field) => {
    const value = data && data[field];
    if (typeof value === "string") {
      return value.trim() !== "";
    }
    return value !== undefined && value !== null;
  });
};

const hasOtherLinkedMethod = (data) => {
  return [
    toCleanString(data && data.eth),
    toCleanString(data && data.sol),
    toCleanString(data && data.appleSub),
    toCleanString(data && data.xUserId),
  ].some((value) => value !== "");
};

const getArgs = () => {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  return {
    write: args.includes("--write"),
    force: args.includes("--force"),
    outPath: outIdx !== -1 ? args[outIdx + 1] : "",
  };
};

const listDocs = async (query, pageSize) => {
  const docs = [];
  let snapshot = await query.get();
  snapshot.docs.forEach((doc) => docs.push(doc));
  while (!snapshot.empty && snapshot.size === pageSize) {
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (!lastDoc) {
      break;
    }
    snapshot = await query.startAfter(lastDoc).get();
    snapshot.docs.forEach((doc) => docs.push(doc));
  }
  return docs;
};

const paginateCollection = async (collectionRef, pageSize, onDoc) => {
  let lastDoc = null;
  while (true) {
    let query = collectionRef.orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }
    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }
    snapshot.docs.forEach(onDoc);
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < pageSize) {
      break;
    }
  }
};

const commitBatches = async (operations) => {
  if (!Array.isArray(operations) || operations.length === 0) {
    return;
  }
  const firestore = admin.firestore();
  const chunkSize = 400;
  for (let index = 0; index < operations.length; index += chunkSize) {
    const batch = firestore.batch();
    const chunk = operations.slice(index, index + chunkSize);
    chunk.forEach((operation) => {
      if (operation.type === "delete") {
        batch.delete(operation.ref);
      } else if (operation.type === "update") {
        batch.update(operation.ref, operation.data);
      }
    });
    await batch.commit();
  }
};

async function main() {
  if (!initAdmin()) {
    throw new Error("Failed to initialize Admin SDK.");
  }

  const { write, force, outPath } = getArgs();
  const firestore = admin.firestore();
  const pageSize = 400;

  const usersWithGoogleFields = [];
  const googleOnlyProfiles = [];
  await paginateCollection(firestore.collection("users"), pageSize, (doc) => {
    const data = doc.data() || {};
    if (!hasGoogleFields(data)) {
      return;
    }
    usersWithGoogleFields.push(doc.id);
    const hasGoogleMethod = toCleanString(data.googleSub) !== "";
    if (hasGoogleMethod && !hasOtherLinkedMethod(data)) {
      googleOnlyProfiles.push(doc.id);
    }
  });

  const authMethodIndexDocs = await listDocs(
    firestore.collection("authMethodIndex")
      .orderBy(admin.firestore.FieldPath.documentId())
      .startAt("google:")
      .endAt("google:\uf8ff")
      .limit(pageSize),
    pageSize
  );
  const authMethodRevocationDocs = await listDocs(
    firestore.collection("authMethodRevocations")
      .orderBy(admin.firestore.FieldPath.documentId())
      .startAt("google:")
      .endAt("google:\uf8ff")
      .limit(pageSize),
    pageSize
  );
  const authProfileMethodCooldownDocs = await listDocs(
    firestore.collection("authProfileMethodCooldowns")
      .where("method", "==", "google")
      .limit(pageSize),
    pageSize
  );
  const authIntentDocs = await listDocs(
    firestore.collection("authIntents")
      .where("method", "==", "google")
      .limit(pageSize),
    pageSize
  );
  const authOpDocs = await listDocs(
    firestore.collection("authOps")
      .where("method", "==", "google")
      .limit(pageSize),
    pageSize
  );
  const authRateLimitDocs = (
    await Promise.all([
      listDocs(firestore.collection("authRateLimits").where("method", "==", "intent-google").limit(pageSize), pageSize),
      listDocs(firestore.collection("authRateLimits").where("method", "==", "verify-google").limit(pageSize), pageSize),
      listDocs(firestore.collection("authRateLimits").where("method", "==", "unlink-google").limit(pageSize), pageSize),
    ])
  ).flat();
  const googleRedirectFlowDocs = await listDocs(
    firestore.collection("googleAuthRedirectFlows")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize),
    pageSize
  );

  const report = {
    generatedAt: new Date().toISOString(),
    write,
    force,
    usersWithGoogleFieldsCount: usersWithGoogleFields.length,
    googleOnlyProfilesCount: googleOnlyProfiles.length,
    authMethodIndexCount: authMethodIndexDocs.length,
    authMethodRevocationsCount: authMethodRevocationDocs.length,
    authProfileMethodCooldownsCount: authProfileMethodCooldownDocs.length,
    authIntentsCount: authIntentDocs.length,
    authOpsCount: authOpDocs.length,
    authRateLimitsCount: authRateLimitDocs.length,
    googleAuthRedirectFlowsCount: googleRedirectFlowDocs.length,
    usersWithGoogleFields,
    googleOnlyProfiles,
    authMethodIndexDocIds: authMethodIndexDocs.map((doc) => doc.id),
    authMethodRevocationDocIds: authMethodRevocationDocs.map((doc) => doc.id),
    authProfileMethodCooldownDocIds: authProfileMethodCooldownDocs.map((doc) => doc.id),
    authIntentDocIds: authIntentDocs.map((doc) => doc.id),
    authOpDocIds: authOpDocs.map((doc) => doc.id),
    authRateLimitDocIds: Array.from(new Set(authRateLimitDocs.map((doc) => doc.id))),
    googleAuthRedirectFlowDocIds: googleRedirectFlowDocs.map((doc) => doc.id),
  };

  console.log("Google auth scrub summary:");
  console.log(JSON.stringify({
    usersWithGoogleFieldsCount: report.usersWithGoogleFieldsCount,
    googleOnlyProfilesCount: report.googleOnlyProfilesCount,
    authMethodIndexCount: report.authMethodIndexCount,
    authMethodRevocationsCount: report.authMethodRevocationsCount,
    authProfileMethodCooldownsCount: report.authProfileMethodCooldownsCount,
    authIntentsCount: report.authIntentsCount,
    authOpsCount: report.authOpsCount,
    authRateLimitsCount: report.authRateLimitsCount,
    googleAuthRedirectFlowsCount: report.googleAuthRedirectFlowsCount,
    write: report.write,
    force: report.force,
  }, null, 2));

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`Wrote detailed report to ${outPath}`);
  }

  if (!write) {
    return;
  }

  if (googleOnlyProfiles.length > 0 && !force) {
    throw new Error("Write mode blocked: googleOnlyProfiles detected. Re-run with --force to remove Google auth from those profiles.");
  }

  const fieldDelete = admin.firestore.FieldValue.delete();
  const operations = [];

  usersWithGoogleFields.forEach((profileId) => {
    operations.push({
      type: "update",
      ref: firestore.collection("users").doc(profileId),
      data: {
        googleSub: fieldDelete,
        googleEmailMasked: fieldDelete,
        googleLinkedAt: fieldDelete,
        googleConsentAt: fieldDelete,
        googleConsentSource: fieldDelete,
      },
    });
  });

  [
    ...authMethodIndexDocs,
    ...authMethodRevocationDocs,
    ...authProfileMethodCooldownDocs,
    ...authIntentDocs,
    ...authOpDocs,
    ...Array.from(new Map(authRateLimitDocs.map((doc) => [doc.id, doc])).values()),
    ...googleRedirectFlowDocs,
  ].forEach((doc) => {
    operations.push({
      type: "delete",
      ref: doc.ref,
    });
  });

  await commitBatches(operations);
  console.log(`Applied ${operations.length} cleanup operations.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
