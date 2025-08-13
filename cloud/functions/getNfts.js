const { onCall, HttpsError } = require("firebase-functions/v2/https");
const fetch = require("node-fetch");

const useStub = true;

exports.getNfts = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  if (useStub) {
    const validReactionIds = [9, 17, 26, 30, 31, 40, 50, 54, 61, 63, 74, 101, 109, 132, 146, 148, 163, 168, 173, 180, 189, 209, 210, 217, 224, 225, 228, 232, 236, 243, 245, 246, 250, 256, 257, 258, 267, 271, 281, 283, 302, 303, 313, 316, 318, 325, 328, 338, 347, 356, 374, 382, 389, 393, 396, 401, 403, 405, 407, 429, 430, 444, 465, 466];
    const validAvatarIds = Array.from({ length: 467 }, (_, i) => i);
    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const shuffled = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
      }
      return a;
    };

    const reactionCount = randomInt(1, Math.min(50, validReactionIds.length));
    const selectedReactionIds = shuffled(validReactionIds).slice(0, reactionCount);
    const swagpack_reactions = selectedReactionIds.map((id) => ({ id, count: randomInt(1, 10) }));

    const usedIds = new Set(selectedReactionIds);
    const maxExtraAvatars = 50 - swagpack_reactions.length;
    const extraAvatarCount = maxExtraAvatars > 0 ? randomInt(0, maxExtraAvatars) : 0;
    const availableAvatarOnlyIds = shuffled(validAvatarIds.filter((id) => !usedIds.has(id))).slice(0, extraAvatarCount);
    const swagpack_avatars = [...swagpack_reactions.map((x) => ({ id: x.id, count: x.count })), ...availableAvatarOnlyIds.map((id) => ({ id, count: randomInt(1, 10) }))];

    return { swagpack_avatars, swagpack_reactions };
  }

  const sol = request.data.sol;
  const eth = request.data.eth;

  if (!sol && !eth) {
    throw new HttpsError("invalid-argument", "Some address is required.");
  }

  try {
    let solNfts = [];
    let ethNfts = [];
    let solTotal = 0;
    let ethTotal = 0;

    if (sol) {
      const solResponse = await fetch("https://mainnet.helius-rpc.com/?api-key=" + process.env.HELIUS_API_KEY, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "my-id",
          method: "searchAssets",
          params: {
            ownerAddress: sol,
            grouping: ["collection", "CjL5WpAmf4cMEEGwZGTfTDKWok9a92ykq9aLZrEK2D5H"],
            page: 1,
            limit: 50,
          },
        }),
      });

      const solData = await solResponse.json();

      if (!solResponse.ok) {
        throw new HttpsError("internal", "Failed to fetch NFTs from Helius API", solData);
      }

      solNfts =
        solData?.result?.items?.map((item) => ({
          direct_link: `https://www.tensor.trade/item/${item.id}`,
          id: item.id,
          content: {
            json_uri: item.content?.json_uri || "",
            links: item.content?.links,
            metadata: {
              name: item.content?.metadata?.name || "",
              image: item.content?.metadata?.image,
            },
          },
          ownership: {
            owner: item.ownership?.owner || "",
          },
          chain: "solana",
        })) || [];

      solTotal = solData?.result?.total || 0;
    }

    if (eth) {
      const ethResponse = await fetch(`https://api.opensea.io/api/v2/chain/ethereum/account/${eth}/nfts?collection=super-metal-mons-gen-2`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": process.env.OPENSEA_API_KEY,
        },
      });

      const ethData = await ethResponse.json();

      if (!ethResponse.ok) {
        throw new HttpsError("internal", "Failed to fetch NFTs from OpenSea API", ethData);
      }

      ethNfts =
        ethData?.nfts?.map((item) => ({
          id: item.identifier,
          direct_link: item.opensea_url || "",
          content: {
            json_uri: item.metadata_url || "",
            links: {
              image: item.display_image_url,
            },
            metadata: {
              name: item.name || "",
              image: item.display_image_url,
            },
          },
          ownership: {
            owner: eth,
          },
          chain: "ethereum",
        })) || [];

      ethTotal = ethData?.nfts?.length || 0;
    }

    const combinedNfts = [...solNfts, ...ethNfts];
    const totalNfts = solTotal + ethTotal;

    return {
      ok: true,
      nfts: combinedNfts,
      total: totalNfts,
    };
  } catch (error) {
    console.error("Error fetching NFTs:", error);
    throw new HttpsError("internal", "Failed to fetch NFTs", error);
  }
});
