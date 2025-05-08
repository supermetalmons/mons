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
