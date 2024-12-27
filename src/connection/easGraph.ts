const PROXY_ADDRESS = "0x6D132b7cDC2b5A5F7C4DFd6C84C0A776062C58Ae";
const SCHEMA = "0x5c6e798cbb817442fa075e01b65d5d65d3ac35c2b05c1306e8771a1c8a3adb32";

export type OnhcainRatingData = {
  numberOfGames: number;
  rating: number;
  id: string;
  recipient: string;
  win: boolean;
  ensName?: string | null;
};
let cachedLeaderboard: OnhcainRatingData[] | null = null;

export async function getOnchainLeaderboard(): Promise<OnhcainRatingData[]> {
  if (cachedLeaderboard && cachedLeaderboard.length > 0) {
    return cachedLeaderboard;
  }

  const easQuery = `
    query Attestation {
      attestations(
        take: 30,
        skip: 0,
        orderBy: { time: desc },
        where: { 
          schemaId: { equals: "${SCHEMA}" }, 
          attester: { equals: "${PROXY_ADDRESS}" },
          revoked: { equals: false },
        },
        distinct: [recipient]
      ) {
        recipient
        decodedDataJson
        id
      }
    }
  `;

  const easResponse = await fetch("https://base.easscan.org/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: easQuery,
      variables: {},
    }),
  });

  if (!easResponse.ok) {
    throw new Error("Failed to fetch attestations");
  }

  const easResponseJson = await easResponse.json();
  const attestations = easResponseJson.data.attestations;

  const ratings: OnhcainRatingData[] = [];

  attestations.forEach((attestation: any) => {
    const decodedData = JSON.parse(attestation.decodedDataJson);

    const nonceItem = decodedData.find((item: any) => item.name === "nonce");
    const ratingItem = decodedData.find((item: any) => item.name === "newRating");
    const winItem = decodedData.find((item: any) => item.name === "win");

    if (nonceItem && ratingItem && winItem && typeof nonceItem.value.value === "number" && typeof ratingItem.value.value === "number" && typeof winItem.value.value === "boolean") {
      ratings.push({
        numberOfGames: nonceItem.value.value + 1,
        rating: ratingItem.value.value,
        id: attestation.id,
        recipient: attestation.recipient,
        win: winItem.value.value,
      });
    }
  });

  if (ratings.length > 0) {
    const { ensCache } = await import("../utils/ensResolver");
    ratings.sort((a, b) => b.rating - a.rating);
    ratings.forEach((rating) => {
      if (rating.recipient in ensCache) {
        rating.ensName = ensCache[rating.recipient];
      }
    });
    cachedLeaderboard = ratings;
  }

  return ratings;
}

export async function fetchOnchainRatingsFromEAS(recipients: string[]): Promise<{ [key: string]: OnhcainRatingData }> {
  const ratingsDict: { [key: string]: OnhcainRatingData } = {};

  const easQuery = `
    query Attestation {
      attestations(
        take: ${recipients.length},
        skip: 0,
        orderBy: { data: desc },
        where: { 
          schemaId: { equals: "${SCHEMA}" }, 
          attester: { equals: "${PROXY_ADDRESS}" },
          recipient: { in: ${JSON.stringify(recipients)} },
          revoked: { equals: false },
        },
        distinct: [recipient]
      ) {
        recipient
        decodedDataJson
        id
      }
    }
  `;

  const easResponse = await fetch("https://base.easscan.org/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: easQuery,
      variables: {},
    }),
  });

  if (!easResponse.ok) {
    throw new Error("Failed to fetch attestations");
  }

  const easResponseJson = await easResponse.json();
  const attestations = easResponseJson.data.attestations;

  attestations.forEach((attestation: any) => {
    const decodedData = JSON.parse(attestation.decodedDataJson);

    const nonceItem = decodedData.find((item: any) => item.name === "nonce");
    const ratingItem = decodedData.find((item: any) => item.name === "newRating");
    const winItem = decodedData.find((item: any) => item.name === "win");

    if (nonceItem && ratingItem && winItem && typeof nonceItem.value.value === "number" && typeof ratingItem.value.value === "number" && typeof winItem.value.value === "boolean") {
      ratingsDict[attestation.recipient] = {
        numberOfGames: nonceItem.value.value + 1,
        rating: ratingItem.value.value,
        id: attestation.id,
        recipient: attestation.recipient,
        win: winItem.value.value,
      };
    }
  });

  recipients.forEach((recipient) => {
    if (!ratingsDict[recipient]) {
      ratingsDict[recipient] = {
        numberOfGames: 0,
        rating: 1500,
        id: "",
        recipient: recipient,
        win: false,
      };
    }
  });

  return ratingsDict;
}
