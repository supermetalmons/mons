const crypto = require("crypto");
const admin = require("firebase-admin");
const { HttpsError } = require("firebase-functions/v2/https");

const AUTO_NAME_BASE_SOURCE = [
  "SmallCreamie",
  "AcidSnowflake",
  "Acorn",
  "Adorn",
  "Alexander",
  "AnvilStardust",
  "Anya",
  "Applecreme",
  "ArchiePendant",
  "Arrowhead",
  "AstroGlow",
  "Automaton",
  "AxeALot",
  "BabyCyan",
  "BabyPendant",
  "BabyVamp",
  "BabyVampi",
  "Bag",
  "BanditBarBeat",
  "Bandit",
  "BashfulPup",
  "BashfulSpikeDrop",
  "Batch",
  "Biker",
  "BirdieOnigiri",
  "BlackGoldStar",
  "BlackStar",
  "BlueHatOekaki",
  "BlueMifella",
  "BlushStar",
  "BoggleHands",
  "Bomberhead",
  "Bonic",
  "Boo",
  "Borg",
  "BornofAsh",
  "Botamon",
  "BoyDrainer",
  "BoyStarFollower",
  "BoyStar",
  "BoywithGoldGem",
  "Breffals",
  "Brock",
  "BronzeIdol",
  "Brounie",
  "Bruggy",
  "Buddha",
  "Bulby",
  "BunnyDrainer",
  "Bunt",
  "BustaPagumon",
  "BustaPiplup",
  "BustaSnorlax",
  "CThru",
  "Cacodemon",
  "CapOekaki",
  "CaptainChef",
  "ChaliceJudge",
  "ChampRival",
  "ChaoKey",
  "CheeryStarBurst",
  "Cheivy",
  "Chester",
  "Chim",
  "Chipmunk",
  "ChristGatcha",
  "ChromeAnimeRival",
  "ChromeGF",
  "Chuck",
  "Chump",
  "CigawrettePack",
  "ClownMewtwo",
  "ClownRival",
  "Clown",
  "CommonChest",
  "Communicator",
  "ConeheadScarecrow",
  "Cousin",
  "Cuban",
  "CursedEtchedSaph",
  "DMG",
  "DarkSlimePossessedbyaStar",
  "David",
  "Debil",
  "DharmaWheel",
  "DiamondWatcher",
  "DiceGuy",
  "Dice",
  "Digivice",
  "DogofAlienOrigin",
  "DopeSkater",
  "DoubleVision",
  "Dragon",
  "Dratini",
  "DreamsBoy",
  "DreamsGirl",
  "DrifTriptych",
  "DrifellaMask",
  "Drifella",
  "Dude",
  "DuskKid",
  "Dwellefen",
  "EHonda",
  "EdibleBulma",
  "EdibleGundam",
  "ElPalk",
  "Elf",
  "Embryo",
  "EmpowerDesertSpeaker",
  "Evolved",
  "ExodiaBoy",
  "ExpertWorkerPendant",
  "Fauxcat",
  "Finn",
  "Flamedramon",
  "Flelf",
  "Flowerkid",
  "Flyn",
  "FriedStar",
  "FrogDrainer",
  "FrogboyPendant",
  "GalaxyPractitioner",
  "GambleBox",
  "Gang",
  "GauntletGavish",
  "Gavil",
  "GeeacheCampo",
  "Gelagel",
  "Gengario",
  "Genie",
  "GeorgewithSleepyMysticPogHat",
  "Gerfugeber",
  "Giddy",
  "GildedBaby",
  "GlitchRadiohead",
  "Glitterfly",
  "Glue",
  "GoldBlessedFollower",
  "GoldGorilla",
  "GoldMellyMil",
  "GoldPlatedShineStar",
  "GoldRacer",
  "GoldSprik",
  "GoldSwoop",
  "GoldenAngel",
  "GoldenGummyBear",
  "GoldenHeartChest",
  "GoldenSlime",
  "GoldenStar",
  "Golem",
  "GoodKid",
  "GosTron",
  "GothFairchild",
  "GothStarSeeker",
  "GotuApeBoy",
  "GrayBuddy",
  "Grekplin",
  "Greymon",
  "GrillStar",
  "GuardofPurityandAnguish",
  "GumNinja",
  "GummyShark",
  "Gupbee",
  "Guyro",
  "HaloSword",
  "Hannah",
  "HappyBladee",
  "HappyEncapsulatedBoywithinaStar",
  "Happyhappytchi",
  "Hauntx",
  "HeadsetFigmata",
  "HealthPotion",
  "HeartKnight",
  "Hegaia",
  "Heraldo",
  "HiddenRamchot",
  "Hippie",
  "Hitmontop",
  "HoloHatDrifella",
  "HomunculusBoy",
  "HoneyBadger",
  "Hoodlum",
  "Hooligan",
  "Hype",
  "IceGummy",
  "IceSorcerer",
  "IcedOutOxfale",
  "IcyStar",
  "Inuyasha",
  "InvertedPaladin",
  "Izzy",
  "JabMan",
  "JackwithMakeup",
  "JesterPigrider",
  "Jirachi",
  "Jolly",
  "Joumondoki",
  "Juno",
  "Justin",
  "KaliPanda",
  "KidwithCoin",
  "KingofDirt",
  "KirbyGladiator",
  "KoukouseiGirl",
  "LavaShroom",
  "LeatherPumch",
  "Lego",
  "LewisChessKing",
  "Luce",
  "LuckyWorkerChain",
  "MC",
  "Mage",
  "MagentaStar",
  "Majora_sMask",
  "MalfyStar",
  "ManaDrop",
  "ManaNuke",
  "Maquinamon",
  "Maracel",
  "Mechdrool",
  "MedicPatafor",
  "Melchron",
  "MeltedMushroom",
  "Mercury",
  "Merv",
  "MetalHead",
  "MetalSkulawar",
  "MetalSlime",
  "Mifella",
  "Migo",
  "MiladyDrainer",
  "MilkBottle",
  "MilkyDrop",
  "Mimelord",
  "MiopixSeed",
  "Mobstead",
  "MobsterScarecrow",
  "Mondrian",
  "MonkeyPuppet",
  "MoonAngel",
  "NeighborBoy",
  "NinjaoftheNight",
  "Notchur",
  "Nugget",
  "Nups",
  "NurseJoy",
  "OhWizard",
  "Omom",
  "OnaBlue",
  "OrangeCreamStar",
  "Orbee",
  "Pakochan",
  "PaleSprice",
  "PancakeCloud",
  "PartyTyrogue",
  "Pastolor",
  "PetDog",
  "PhoenixStar",
  "Pied",
  "Pinhead",
  "PinkGummyStar",
  "PinkHatOekaki",
  "Pirate",
  "PlanetChild",
  "PlanetDiverDarry",
  "PolyViolet",
  "PomPom",
  "Pouty",
  "PowerDriver",
  "Pray",
  "Pretender",
  "PriestofTalashor",
  "PrinceSlime",
  "PrincessFighter",
  "ProRacer",
  "Pugs",
  "PuppyTank",
  "PureCapsule",
  "Puzzleface",
  "Radbro",
  "RainbowKartchari",
  "RainbowSatellite",
  "RainbowStar",
  "Ranger",
  "RareCandy",
  "Rev",
  "RivalBenkin",
  "RivalCapsuleCollector",
  "RivalTeiko",
  "RivalwithIglooMarbleHat",
  "Rixzy",
  "RobberFairy",
  "Robunx",
  "Rogo",
  "Roller",
  "Rosha",
  "RothkoToji100",
  "RoyalGeno",
  "Royale",
  "Ruby",
  "Rudolph",
  "RuneHelm",
  "RuneTraveller",
  "Rune",
  "Rusty",
  "Ryuopon",
  "Sadge",
  "Sailor",
  "Salmon",
  "SamuraiBeyblady",
  "SansDMG",
  "Satsuy",
  "SaturatedBlue",
  "ScaryBladee",
  "ScreamingBattleChild",
  "Scroll",
  "SeedRot",
  "Seed",
  "SentientStar",
  "Shepherd",
  "Shik",
  "Shimmer",
  "Shishi",
  "SilverKumamon",
  "SilverYeBear",
  "Silvo",
  "SkellySkull",
  "Skulljispirit",
  "SleepyMoe",
  "SleepyPartyMilady",
  "SlemLordAlien",
  "Smithdome",
  "SoftGirl",
  "Solfu",
  "Solrock",
  "SorcererHat",
  "SparkleRadiohead",
  "Spindle",
  "SpirelmetBadge",
  "SpiritBadge",
  "SpiritNuke",
  "SpiritPirate",
  "Squid",
  "Squogo",
  "StarMullet",
  "StarTracker",
  "StarwithStand",
  "SunStar",
  "SuperSaiyan",
  "SupermetalAstra",
  "SupermetalManaDrop",
  "SupermetalStar",
  "SwagBoyPhilanthropist",
  "SweetBabyAngel",
  "SweetBabyBear",
  "TabletofMan",
  "Tadpole",
  "Tai",
  "Tails",
  "TamaElf",
  "TeacupGheist",
  "Teapot",
  "TechnicallyAdvancedRoboMon",
  "ThroneofTerabyte",
  "Toad",
  "Toffee",
  "TojiPocket",
  "ToonBlueEyes",
  "Toybox",
  "Trio",
  "TrippyTeleworker",
  "TrunkScry",
  "TwinkleStar",
  "Tyclone",
  "UapStar",
  "UndeadDireSoldier",
  "Vamp",
  "VoxelKid",
  "Vril",
  "WafleerGoldTyke",
  "WallazWiz",
  "WartornStar",
  "WarpedWiley",
  "WatercolorMilady",
  "Welf",
  "Whisker",
  "Whist",
  "WhistlingGoldCash",
  "WhiteGummyStar",
  "WhiteJest",
  "WickzBoy",
  "Wickz",
  "Wink",
  "Winrar",
  "WizardofAces",
  "Wizard",
  "WorkerSon",
  "WorkerTen",
  "Worry",
  "Yao",
  "YellowStar",
  "YinYang",
  "YoungAlbino",
  "YoungChildCannonLoader",
  "YugiScarecrow",
  "ZClassDrainer",
  "ZebraCloudGabber",
  "Zig",
  "Zinc",
  "ZombieStar",
  "Zorn",
];

const AUTO_NAME_MAX_ATTEMPTS = 30;

let cachedAutoNameBases = null;

const toCleanString = (value) => (typeof value === "string" ? value.trim() : "");

const isReservedExplicitUsername = (name) => toCleanString(name).toLowerCase() === "anon";

const normalizeNameBaseForAuto = (rawBase) => {
  const cleanBase = toCleanString(rawBase);
  if (!cleanBase) {
    return "";
  }
  return cleanBase.replace(/[^a-zA-Z0-9]/g, "");
};

const loadAutoNameBases = () => {
  if (Array.isArray(cachedAutoNameBases)) {
    return cachedAutoNameBases;
  }

  const dedupedBases = [];
  const seen = new Set();
  AUTO_NAME_BASE_SOURCE.forEach((line) => {
    const normalized = normalizeNameBaseForAuto(line);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    dedupedBases.push(normalized);
  });

  if (dedupedBases.length === 0) {
    throw new HttpsError("internal", "auto-name-source-empty");
  }

  cachedAutoNameBases = dedupedBases;
  return cachedAutoNameBases;
};

const buildRandomAutoUsername = () => {
  const bases = loadAutoNameBases();
  const base = bases[crypto.randomInt(bases.length)];
  const suffix = `${crypto.randomInt(10000)}`.padStart(4, "0");
  return `${base}${suffix}`;
};

const claimUsernameForProfile = async ({ profileId, username }) => {
  const resolvedProfileId = toCleanString(profileId);
  const resolvedUsername = toCleanString(username);

  if (!resolvedProfileId || !resolvedUsername) {
    throw new HttpsError("invalid-argument", "profileId and username are required.");
  }

  const firestore = admin.firestore();
  const usersRef = firestore.collection("users");
  const profileRef = usersRef.doc(resolvedProfileId);
  const usernameIndexRef = firestore.collection("usernameIndex").doc(resolvedUsername);

  let result = {
    status: "taken",
    username: null,
  };
  const nowMs = Date.now();

  await firestore.runTransaction(async (transaction) => {
    const [profileSnapshot, usernameIndexSnapshot] = await Promise.all([transaction.get(profileRef), transaction.get(usernameIndexRef)]);
    if (!profileSnapshot.exists) {
      throw new HttpsError("not-found", "profile-not-found");
    }

    const profileData = profileSnapshot.data() || {};
    const currentUsername = toCleanString(profileData.username);
    const hasExplicitCurrentUsername = currentUsername !== "" && !isReservedExplicitUsername(currentUsername);
    if (hasExplicitCurrentUsername && currentUsername !== resolvedUsername) {
      result = {
        status: "already-has-username",
        username: currentUsername,
      };
      return;
    }

    if (currentUsername === resolvedUsername) {
      transaction.set(
        usernameIndexRef,
        {
          profileId: resolvedProfileId,
          username: resolvedUsername,
          updatedAtMs: nowMs,
        },
        { merge: true }
      );
      result = {
        status: "claimed",
        username: resolvedUsername,
      };
      return;
    }

    let takenByDifferentProfile = false;
    let shouldRunLegacyUsernameLookup = !usernameIndexSnapshot.exists;
    if (usernameIndexSnapshot.exists) {
      const usernameIndexData = usernameIndexSnapshot.data() || {};
      const indexedProfileId = toCleanString(usernameIndexData.profileId);
      if (indexedProfileId && indexedProfileId !== resolvedProfileId) {
        const indexedProfileSnapshot = await transaction.get(usersRef.doc(indexedProfileId));
        if (indexedProfileSnapshot.exists) {
          const indexedProfileData = indexedProfileSnapshot.data() || {};
          const indexedUsername = toCleanString(indexedProfileData.username);
          if (indexedUsername === resolvedUsername) {
            takenByDifferentProfile = true;
          } else {
            shouldRunLegacyUsernameLookup = true;
          }
        } else {
          shouldRunLegacyUsernameLookup = true;
        }
      } else if (indexedProfileId === resolvedProfileId) {
        shouldRunLegacyUsernameLookup = true;
      } else if (!indexedProfileId) {
        shouldRunLegacyUsernameLookup = true;
      }
    }

    if (!takenByDifferentProfile && shouldRunLegacyUsernameLookup) {
      const existingUsernameSnapshot = await transaction.get(usersRef.where("username", "==", resolvedUsername).limit(2));
      if (existingUsernameSnapshot.size > 1) {
        takenByDifferentProfile = true;
      } else if (!existingUsernameSnapshot.empty) {
        const existingDoc = existingUsernameSnapshot.docs[0];
        if (existingDoc.id !== resolvedProfileId) {
          takenByDifferentProfile = true;
        }
      }
    }

    if (takenByDifferentProfile) {
      result = {
        status: "taken",
        username: null,
      };
      return;
    }

    let previousUsernameIndexRef = null;
    let previousUsernameIndexSnapshot = null;
    if (currentUsername && currentUsername !== resolvedUsername) {
      previousUsernameIndexRef = firestore.collection("usernameIndex").doc(currentUsername);
      previousUsernameIndexSnapshot = await transaction.get(previousUsernameIndexRef);
    }

    transaction.set(
      usernameIndexRef,
      {
        profileId: resolvedProfileId,
        username: resolvedUsername,
        updatedAtMs: nowMs,
      },
      { merge: true }
    );
    transaction.update(profileRef, { username: resolvedUsername });
    if (currentUsername && currentUsername !== resolvedUsername) {
      if (previousUsernameIndexSnapshot && previousUsernameIndexSnapshot.exists && previousUsernameIndexRef) {
        const previousUsernameIndexData = previousUsernameIndexSnapshot.data() || {};
        const previousIndexedProfileId = toCleanString(previousUsernameIndexData.profileId);
        if (previousIndexedProfileId === resolvedProfileId) {
          transaction.delete(previousUsernameIndexRef);
        }
      }
    }
    result = {
      status: "claimed",
      username: resolvedUsername,
    };
  });

  return result;
};

const assignRandomUsernameIfNeededForAppleProfile = async ({ profileId, maxAttempts = AUTO_NAME_MAX_ATTEMPTS }) => {
  const resolvedProfileId = toCleanString(profileId);
  if (!resolvedProfileId) {
    throw new HttpsError("invalid-argument", "profileId is required.");
  }

  const firestore = admin.firestore();
  const profileRef = firestore.collection("users").doc(resolvedProfileId);
  const profileSnapshot = await profileRef.get();
  if (!profileSnapshot.exists) {
    throw new HttpsError("not-found", "profile-not-found");
  }

  const profileData = profileSnapshot.data() || {};
  const currentUsername = toCleanString(profileData.username);
  const hasExplicitUsername = currentUsername !== "" && !isReservedExplicitUsername(currentUsername);
  const hasEth = toCleanString(profileData.eth) !== "";
  const hasSol = toCleanString(profileData.sol) !== "";
  if (hasExplicitUsername || hasEth || hasSol) {
    return profileSnapshot;
  }

  const attemptLimit = Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : AUTO_NAME_MAX_ATTEMPTS;
  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    const candidate = buildRandomAutoUsername();
    const claimResult = await claimUsernameForProfile({
      profileId: resolvedProfileId,
      username: candidate,
    });
    if (claimResult.status === "claimed" || claimResult.status === "already-has-username") {
      const refreshedSnapshot = await profileRef.get();
      if (!refreshedSnapshot.exists) {
        throw new HttpsError("internal", "profile-missing-after-username-claim");
      }
      return refreshedSnapshot;
    }
  }

  throw new HttpsError("aborted", "username-generation-exhausted");
};

const setExplicitUsernameForProfile = async ({ profileId, username }) => {
  const resolvedProfileId = toCleanString(profileId);
  const resolvedUsername = toCleanString(username);

  if (!resolvedProfileId || !resolvedUsername) {
    throw new HttpsError("invalid-argument", "profileId and username are required.");
  }

  const firestore = admin.firestore();
  const usersRef = firestore.collection("users");
  const profileRef = usersRef.doc(resolvedProfileId);
  const usernameIndexRef = firestore.collection("usernameIndex").doc(resolvedUsername);
  let result = {
    status: "taken",
    username: null,
  };
  const nowMs = Date.now();

  await firestore.runTransaction(async (transaction) => {
    const [profileSnapshot, usernameIndexSnapshot] = await Promise.all([transaction.get(profileRef), transaction.get(usernameIndexRef)]);
    if (!profileSnapshot.exists) {
      throw new HttpsError("not-found", "profile-not-found");
    }

    const profileData = profileSnapshot.data() || {};
    const currentUsername = toCleanString(profileData.username);
    if (currentUsername === resolvedUsername) {
      transaction.set(
        usernameIndexRef,
        {
          profileId: resolvedProfileId,
          username: resolvedUsername,
          updatedAtMs: nowMs,
        },
        { merge: true }
      );
      result = {
        status: "unchanged",
        username: resolvedUsername,
      };
      return;
    }

    let takenByDifferentProfile = false;
    let shouldRunLegacyUsernameLookup = !usernameIndexSnapshot.exists;
    if (usernameIndexSnapshot.exists) {
      const usernameIndexData = usernameIndexSnapshot.data() || {};
      const indexedProfileId = toCleanString(usernameIndexData.profileId);
      if (indexedProfileId && indexedProfileId !== resolvedProfileId) {
        const indexedProfileSnapshot = await transaction.get(usersRef.doc(indexedProfileId));
        if (indexedProfileSnapshot.exists) {
          const indexedProfileData = indexedProfileSnapshot.data() || {};
          const indexedUsername = toCleanString(indexedProfileData.username);
          if (indexedUsername === resolvedUsername) {
            takenByDifferentProfile = true;
          } else {
            shouldRunLegacyUsernameLookup = true;
          }
        } else {
          shouldRunLegacyUsernameLookup = true;
        }
      } else if (indexedProfileId === resolvedProfileId) {
        shouldRunLegacyUsernameLookup = true;
      } else if (!indexedProfileId) {
        shouldRunLegacyUsernameLookup = true;
      }
    }

    if (!takenByDifferentProfile && shouldRunLegacyUsernameLookup) {
      const existingUsernameSnapshot = await transaction.get(usersRef.where("username", "==", resolvedUsername).limit(2));
      if (existingUsernameSnapshot.size > 1) {
        takenByDifferentProfile = true;
      } else if (!existingUsernameSnapshot.empty) {
        const existingDoc = existingUsernameSnapshot.docs[0];
        if (existingDoc.id !== resolvedProfileId) {
          takenByDifferentProfile = true;
        }
      }
    }

    if (takenByDifferentProfile) {
      result = {
        status: "taken",
        username: null,
      };
      return;
    }

    let previousUsernameIndexRef = null;
    let previousUsernameIndexSnapshot = null;
    if (currentUsername && currentUsername !== resolvedUsername) {
      previousUsernameIndexRef = firestore.collection("usernameIndex").doc(currentUsername);
      previousUsernameIndexSnapshot = await transaction.get(previousUsernameIndexRef);
    }

    transaction.update(profileRef, { username: resolvedUsername });
    transaction.set(
      usernameIndexRef,
      {
        profileId: resolvedProfileId,
        username: resolvedUsername,
        updatedAtMs: nowMs,
      },
      { merge: true }
    );

    if (currentUsername && currentUsername !== resolvedUsername) {
      if (previousUsernameIndexSnapshot && previousUsernameIndexSnapshot.exists && previousUsernameIndexRef) {
        const previousUsernameIndexData = previousUsernameIndexSnapshot.data() || {};
        const previousIndexedProfileId = toCleanString(previousUsernameIndexData.profileId);
        if (previousIndexedProfileId === resolvedProfileId) {
          transaction.delete(previousUsernameIndexRef);
        }
      }
    }

    result = {
      status: "claimed",
      username: resolvedUsername,
    };
  });

  return result;
};

const clearUsernameForProfile = async ({ profileId }) => {
  const resolvedProfileId = toCleanString(profileId);
  if (!resolvedProfileId) {
    throw new HttpsError("invalid-argument", "profileId is required.");
  }

  const firestore = admin.firestore();
  const profileRef = firestore.collection("users").doc(resolvedProfileId);
  let result = {
    status: "cleared",
  };

  await firestore.runTransaction(async (transaction) => {
    const profileSnapshot = await transaction.get(profileRef);
    if (!profileSnapshot.exists) {
      throw new HttpsError("not-found", "profile-not-found");
    }
    const profileData = profileSnapshot.data() || {};
    const currentUsername = toCleanString(profileData.username);
    if (currentUsername === "") {
      result = {
        status: "unchanged",
      };
      return;
    }

    const previousUsernameIndexRef = firestore.collection("usernameIndex").doc(currentUsername);
    const previousUsernameIndexSnapshot = await transaction.get(previousUsernameIndexRef);

    transaction.update(profileRef, { username: "" });
    if (previousUsernameIndexSnapshot.exists) {
      const previousUsernameIndexData = previousUsernameIndexSnapshot.data() || {};
      const previousIndexedProfileId = toCleanString(previousUsernameIndexData.profileId);
      if (previousIndexedProfileId === resolvedProfileId) {
        transaction.delete(previousUsernameIndexRef);
      }
    }

    result = {
      status: "cleared",
    };
  });

  return result;
};

module.exports = {
  isReservedExplicitUsername,
  normalizeNameBaseForAuto,
  loadAutoNameBases,
  buildRandomAutoUsername,
  claimUsernameForProfile,
  assignRandomUsernameIfNeededForAppleProfile,
  setExplicitUsernameForProfile,
  clearUsernameForProfile,
};
