const { onCall, HttpsError } = require("firebase-functions/v2/https");
const fetch = require("node-fetch");

exports.getNfts = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "Helius API key is not configured.");
  }

  const sol = request.data.sol;

  if (!sol) {
    throw new HttpsError("invalid-argument", "Solana address is required.");
  }

  try {
    const response = await fetch("https://mainnet.helius-rpc.com/?api-key=" + apiKey, {
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

    const data = await response.json();

    if (!response.ok) {
      throw new HttpsError("internal", "Failed to fetch NFTs from Helius API", data);
    }

    const filteredNfts =
      data?.result?.items?.map((item) => ({
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
      })) || [];

    return {
      ok: true,
      nfts: filteredNfts,
      total: data?.result?.total || 0,
    };
  } catch (error) {
    console.error("Error fetching NFTs:", error);
    throw new HttpsError("internal", "Failed to fetch NFTs", error);
  }
});
