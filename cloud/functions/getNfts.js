const { onCall, HttpsError } = require("firebase-functions/v2/https");
const fetch = require("node-fetch");

exports.getNfts = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const sol = request.data.sol;
  const eth = request.data.eth;

  if (!sol && !eth) {
    throw new HttpsError("invalid-argument", "Some address is required.");
  }

  try {
    const validReactionIds = [9, 17, 20, 26, 30, 31, 40, 50, 54, 61, 63, 74, 101, 109, 132, 146, 148, 163, 168, 173, 180, 189, 209, 210, 217, 224, 225, 228, 232, 236, 243, 245, 246, 250, 256, 257, 258, 267, 271, 281, 283, 289, 302, 303, 313, 316, 318, 325, 328, 338, 347, 356, 374, 382, 389, 393, 396, 401, 403, 405, 407, 429, 430, 444, 465, 466];
    async function fetchCollectionIdCounts(ownerAddress, collectionId) {
      const idCounts = new Map();
      if (!ownerAddress) return [];
      let cursor = undefined;
      const limit = 1000;
      let fetched = 0;
      let total = Infinity;
      while (fetched < total) {
        const params = {
          ownerAddress,
          grouping: ["collection", collectionId],
          limit,
        };
        if (cursor) {
          params.cursor = cursor;
        }
        const solResponse = await fetch("https://mainnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "mons-get-nfts",
            method: "searchAssets",
            params,
          }),
        });
        const solData = await solResponse.json();
        if (!solResponse.ok) {
          return [];
        }
        const resultNode = solData?.result || {};
        const items = resultNode?.items || [];
        total = typeof resultNode?.total === "number" ? resultNode.total : total;
        for (const item of items) {
          const jsonUri = item?.content?.json_uri || "";
          if (typeof jsonUri !== "string" || jsonUri.length === 0) continue;
          try {
            const lastSlash = jsonUri.lastIndexOf("/");
            let tail = lastSlash >= 0 ? jsonUri.slice(lastSlash + 1) : jsonUri;
            const q = tail.indexOf("?");
            if (q >= 0) tail = tail.slice(0, q);
            const h = tail.indexOf("#");
            if (h >= 0) tail = tail.slice(0, h);
            const idNum = parseInt(tail, 10);
            if (!Number.isFinite(idNum)) continue;
            if (!idCounts.has(idNum)) idCounts.set(idNum, 0);
            idCounts.set(idNum, idCounts.get(idNum) + 1);
          } catch (_) {}
        }
        fetched += items.length;
        if (!items.length || fetched >= total || items.length < limit) break;
        cursor = resultNode?.cursor;
        if (!cursor) break;
      }
      return Array.from(idCounts.entries()).map(([id, count]) => ({ id, count }));
    }

    let swagpack_avatars = [];
    let swagpack_reactions = [];
    let specials = [];

    if (sol) {
      const primaryCollectionId = "C22esis7kQMbX9JGWsMaKvsh1X5GeBmHPju28jiKDyAP";
      const specialsCollectionId = "GCcbUaghGawyM76BhJHsHUXb9kq7H3AZhPL7S3p9WajP";
      const avatarsPromise = fetchCollectionIdCounts(sol, primaryCollectionId);
      const specialsPromise = fetchCollectionIdCounts(sol, specialsCollectionId);
      const [avatars, specialIds] = await Promise.all([avatarsPromise, specialsPromise]);
      swagpack_avatars = avatars;
      const reactionSet = new Set(validReactionIds);
      swagpack_reactions = avatars.filter((x) => reactionSet.has(x.id));
      specials = specialIds;
    }

    return { ok: true, specials, swagpack_avatars, swagpack_reactions };
  } catch (error) {
    console.error("Error fetching NFTs:", error);
    return { ok: false };
  }
});
