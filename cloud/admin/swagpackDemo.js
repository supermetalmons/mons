#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { getDisplayNameFromAddress, sendBotMessage, getTelegramEmojiTag } = require("../functions/utils");

try {
  const envPath = path.resolve(__dirname, "../functions/.env");
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {}

const defaultLink = "https://mons.link/";

function buildEmojiSafeLink(message, href) {
  const text = message || "";
  const segments = [];
  const regex = /<tg-emoji.*?<\/tg-emoji>/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "emoji", value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  if (segments.length === 0) {
    return `<a href="${href}">${text}</a>`;
  }
  let result = "";
  for (const segment of segments) {
    if (segment.type === "emoji") {
      result += segment.value;
    } else if (segment.value.length > 0) {
      result += `<a href="${href}">${segment.value}</a>`;
    }
  }
  if (result === "") {
    return `<a href="${href}"></a>`;
  }
  return result;
}

const swagpackNames = {
  1000: "3D Chleb",
  1001: "A Small Creamie",
  1002: "Acid Snowflake",
  1003: "Acorn",
  1004: "Adorn",
  1005: "Alexander",
  1006: "Anvil Stardust",
  1007: "Anya",
  1008: "Applecreme",
  1009: "Archie Pendant",
  1010: "Arrowhead",
  1011: "Astro Glow",
  1012: "Automaton",
  1013: "Axe-A-Lot",
  1014: "Baby Cyan",
  1015: "Baby Pendant",
  1016: "Baby Vamp",
  1017: "Baby Vampi",
  1018: "Bag",
  1019: "Bandit Bar Beat",
  1020: "Bandit",
  1021: "Bashful Pup",
  1022: "Bashful Spike Drop",
  1023: "Batch",
  1024: "Biker",
  1025: "Birdie Onigiri",
  1026: "Black Gold Star",
  1027: "Black Star",
  1028: "Blue Hat Oekaki",
  1029: "Blue Mifella",
  1030: "Blush Star",
  1031: "Boggle Hands",
  1032: "Bomberhead",
  1033: "Bonic",
  1034: "Boo",
  1035: "Borg",
  1036: "Born of Ash",
  1037: "Botamon",
  1038: "Boy Drainer",
  1039: "Boy Star Follower",
  1040: "Boy Star",
  1041: "Boy with Gold Gem",
  1042: "Breffals",
  1043: "Brock",
  1044: "Bronze Idol",
  1045: "Brounie",
  1046: "Bruggy",
  1047: "Buddha",
  1048: "Bulby",
  1049: "Bunny Drainer",
  1050: "Bunt",
  1051: "Busta Pagumon 2",
  1052: "Busta Pagumon",
  1053: "Busta Piplup",
  1054: "Busta Snorlax",
  1055: "C-Thru",
  1056: "Cacodemon",
  1057: "Cap Oekaki",
  1058: "Captain Chef",
  1059: "Chalice Judge",
  1060: "Champ Rival",
  1061: "Chao Key",
  1062: "Cheery Star-Burst",
  1063: "Cheivy",
  1064: "Chester",
  1065: "Chim ",
  1066: "Chipmunk",
  1067: "Christ Gatcha",
  1068: "Chrome Anime Rival",
  1069: "Chrome GF",
  1070: "Chuck",
  1071: "Chump",
  1072: "Cigawrette Pack",
  1073: "Clown Mewtwo",
  1074: "Clown Rival",
  1075: "Clown",
  1076: "Common Chest",
  1077: "Communicator",
  1078: "Conehead Scarecrow",
  1079: "Cousin",
  1080: "Cuban",
  1081: "Cursed Etched Saph",
  1082: "DMG",
  1083: "Dark Slime Possessed by a Star",
  1084: "David",
  1085: "Debil",
  1086: "Dharma Wheel",
  1087: "Diamond Watcher",
  1088: "Dice Guy",
  1089: "Dice",
  1090: "Digivice",
  1091: "Dog of Alien Origin",
  1092: "Dope Skater",
  1093: "Double Vision",
  1094: "Dragon",
  1095: "Dratini",
  1096: "Dreams Boy",
  1097: "Dreams Girl",
  1098: "Drif Triptych",
  1099: "Drifella Mask",
  1100: "Drifella",
  1101: "Dude",
  1102: "Dusk Kid",
  1103: "Dwellefen",
  1104: "E. Honda",
  1105: "Edible Bulma",
  1106: "Edible Gundam",
  1107: "ElPalk",
  1108: "Elf",
  1109: "Embryo",
  1110: "Empower Desert Speaker",
  1111: "Evolved",
  1112: "Exodia Boy",
  1113: "Expert Worker Pendant",
  1114: "Fauxcat",
  1115: "Finn",
  1116: "Flamedramon",
  1117: "Flelf",
  1118: "Flowerkid",
  1119: "Flyn",
  1120: "Fried Star",
  1121: "Frog Drainer",
  1122: "Frogboy Pendant",
  1123: "Galaxy Practitioner",
  1124: "Gamble Box",
  1125: "Gang",
  1126: "Gauntlet Gavish",
  1127: "Gavil",
  1128: "Geeache Campo",
  1129: "Gelagel",
  1130: "Gengario",
  1131: "Genie",
  1132: "George with Sleepy Mystic Pog Hat",
  1133: "Gerfugeber",
  1134: "Giddy",
  1135: "Gilded Baby",
  1136: "Glitch Radiohead",
  1137: "Glitterfly",
  1138: "Glue",
  1139: "Gold Blessed Follower",
  1140: "Gold Gorilla",
  1141: "Gold Melly Mil",
  1142: "Gold Plated ShineStar",
  1143: "Gold Racer",
  1144: "Gold Sprik",
  1145: "Gold Swoop",
  1146: "Golden Angel",
  1147: "Golden Gummy Bear",
  1148: "Golden Heart Chest",
  1149: "Golden Slime",
  1150: "Golden Star",
  1151: "Golem",
  1152: "Good Kid",
  1153: "Gos-Tron",
  1154: "Goth Fairchild",
  1155: "Goth Star Seeker",
  1156: "GotuApeBoy",
  1157: "Gray Buddy",
  1158: "Grekplin",
  1159: "Greymon",
  1160: "Grill Star",
  1161: "Guard of Purity and Anguish",
  1162: "Gum Ninja",
  1163: "Gummy Shark",
  1164: "Gupbee",
  1165: "Guyro",
  1166: "Halo Sword",
  1167: "Hannah",
  1168: "Happy Bladee",
  1169: "Happy Encapsulated Boy within a Star",
  1170: "Happyhappytchi",
  1171: "Hauntx",
  1172: "Headset Figmata",
  1173: "Health Potion",
  1174: "Heart Knight",
  1175: "Hegaia",
  1176: "Heraldo",
  1177: "Hidden Ramchot",
  1178: "Hippie",
  1179: "Hitmontop",
  1180: "Holo Hat Drifella",
  1181: "Homunculus Boy",
  1182: "Honey Badger",
  1183: "Hoodlum",
  1184: "Hooligan",
  1185: "Hype",
  1186: "Ice Gummy",
  1187: "Ice Sorcerer",
  1188: "Iced Out Oxfale",
  1189: "Icy Star",
  1190: "Inuyasha",
  1191: "Inverted Paladin",
  1192: "Izzy",
  1193: "Jab Man",
  1194: "Jack with Makeup",
  1195: "Jester Pigrider",
  1196: "Jirachi",
  1197: "Jolly",
  1198: "Joumondoki",
  1199: "Juno",
  1200: "Justin",
  1201: "Kali Panda",
  1202: "Kid with Coin",
  1203: "King of Dirt",
  1204: "Kirby Gladiator",
  1205: "Koukousei Girl",
  1206: "LSW Arale",
  1207: "LSW Ash Hat",
  1208: "LSW Astronaut",
  1209: "LSW Black Drifella Hood",
  1210: "LSW Blue Drifella Hood",
  1211: "LSW Blue Knit",
  1212: "LSW Chrome Hat",
  1213: "LSW Cookie",
  1214: "LSW Diamond Dog",
  1215: "LSW Diamond Hood",
  1216: "LSW Dog",
  1217: "LSW Dragon",
  1218: "LSW Frog Hat",
  1219: "LSW Frog",
  1220: "LSW Frosty",
  1221: "LSW Fuzzy Panda",
  1222: "LSW Galaxy Frog",
  1223: "LSW Galaxy",
  1224: "LSW General",
  1225: "LSW Ghost",
  1226: "LSW Golden Blue Shell",
  1227: "LSW Golden Crown",
  1228: "LSW Green Fizz",
  1229: "LSW Hayabusa",
  1230: "LSW Icy Aluminum",
  1231: "LSW Icy Cinnamon",
  1232: "LSW Jello",
  1233: "LSW Knight",
  1234: "LSW Knit Hood",
  1235: "LSW Knit Mask",
  1236: "LSW Knit Mimikyu",
  1237: "LSW Knit Skull",
  1238: "LSW Lava",
  1239: "LSW Mimikyu Hood",
  1240: "LSW Mouse",
  1241: "LSW Nett",
  1242: "LSW Panda",
  1243: "LSW Racoon Backwards Hat",
  1244: "LSW Racoon",
  1245: "LSW Russian",
  1246: "LSW Shadow Wizard",
  1247: "LSW Shiesty",
  1248: "LSW Silver",
  1249: "LSW Soldier",
  1250: "LSW Sonic",
  1251: "LSW Spiky Worm",
  1252: "LSW Student Mage",
  1253: "LSW Teddy Hat",
  1254: "LSW Thief",
  1255: "LSW Venom",
  1256: "LSW Wizard",
  1257: "LSW Wolf",
  1258: "LSW Yawn",
  1259: "LSW Ye Bear",
  1260: "Lava Shroom",
  1261: "LeatherPumch",
  1262: "Lego",
  1263: "Lewis Chess King",
  1264: "Luce",
  1265: "Lucky Worker Chain",
  1266: "MC",
  1267: "Mage",
  1268: "Magenta Star",
  1269: "Majora_s Mask",
  1270: "Malfy Star",
  1271: "Mana Drop",
  1272: "Mana Nuke",
  1273: "Maquinamon",
  1274: "Maracel",
  1275: "Mechdrool",
  1276: "Medic Patafor",
  1277: "Melchron",
  1278: "Melted Mushroom",
  1279: "Mercury",
  1280: "Merv",
  1281: "Metal Head",
  1282: "Metal Skulawar",
  1283: "Metal Slime",
  1284: "Mifella",
  1285: "Migo",
  1286: "Milady Drainer",
  1287: "Milk Bottle",
  1288: "Milky Drop",
  1289: "Mimelord",
  1290: "Miopix Seed",
  1291: "Mobstead",
  1292: "Mobster Scarecrow",
  1293: "Mondrian",
  1294: "Monkey Puppet",
  1295: "Moon Angel",
  1296: "Neighbor Boy",
  1297: "Ninja of the Night",
  1298: "Notchur",
  1299: "Nugget",
  1300: "Nups",
  1301: "Nurse Joy",
  1302: "Oh... a Wizard",
  1303: "Omom",
  1304: "Ona Blue",
  1305: "Orange Cream Star",
  1306: "Orbee",
  1307: "Pakochan",
  1308: "Pale Sprice",
  1309: "Pancake-Cloud",
  1310: "Party Tyrogue",
  1311: "Pastolor",
  1312: "Pet Dog",
  1313: "Phoenix Star",
  1314: "Pied",
  1315: "Pinhead",
  1316: "Pink Gummy Star",
  1317: "Pink Hat Oekaki",
  1318: "Pirate",
  1319: "Planet Child",
  1320: "Planet Diver Darry",
  1321: "PolyViolet",
  1322: "PomPom",
  1323: "Pouty",
  1324: "Power Driver",
  1325: "Pray",
  1326: "Pretender",
  1327: "Priest of Talashor",
  1328: "Prince Slime",
  1329: "Princess Fighter",
  1330: "Pro Racer",
  1331: "Pugs",
  1332: "Puppy Tank",
  1333: "Pure Capsule",
  1334: "Puzzleface",
  1335: "Radbro",
  1336: "Rainbow Kartchari",
  1337: "Rainbow Satellite",
  1338: "Rainbow Star",
  1339: "Ranger",
  1340: "Rare Candy",
  1341: "Rev",
  1342: "Rival Benkin",
  1343: "Rival Capsule Collector",
  1344: "Rival Teiko",
  1345: "Rival with Igloo Marble Hat",
  1346: "Rixzy",
  1347: "Robber Fairy",
  1348: "Robunx",
  1349: "Rogo",
  1350: "Roller",
  1351: "Rosha",
  1352: "Rothko Toji 100",
  1353: "Royal Geno",
  1354: "Royale",
  1355: "Ruby",
  1356: "Rudolph",
  1357: "Rune Helm",
  1358: "Rune Traveller",
  1359: "Rune",
  1360: "Rusty",
  1361: "Ryuopon",
  1362: "Sadge",
  1363: "Sailor",
  1364: "Salmon",
  1365: "Samurai Beyblady",
  1366: "Sans DMG",
  1367: "Satsuy",
  1368: "Saturated Blue",
  1369: "Scary Bladee",
  1370: "Screaming Battle-Child",
  1371: "Scroll",
  1372: "Seed Rot",
  1373: "Seed",
  1374: "Sentient Star",
  1375: "Shepherd",
  1376: "Shik",
  1377: "Shimmer",
  1378: "Shishi",
  1379: "Silver Kumamon",
  1380: "Silver Ye Bear",
  1381: "Silvo",
  1382: "Skelly Skull",
  1383: "Skullji spirit",
  1384: "Sleepy Moe",
  1385: "Sleepy Party Milady",
  1386: "Slem-Lord Alien",
  1387: "Smithdome",
  1388: "Soft Girl",
  1389: "Solfu",
  1390: "Solrock",
  1391: "Sorcerer Hat",
  1392: "Sparkle Radiohead",
  1393: "Spindle",
  1394: "Spirelmet Badge",
  1395: "Spirit Badge",
  1396: "Spirit Nuke",
  1397: "Spirit Pirate",
  1398: "Squid",
  1399: "Squogo",
  1400: "Star Mullet",
  1401: "Star Tracker",
  1402: "Star with Stand",
  1403: "Sun Star",
  1404: "Super Saiyan",
  1405: "Supermetal Astra",
  1406: "Supermetal Mana Drop",
  1407: "Supermetal Star",
  1408: "Swag Boy Philanthropist",
  1409: "Sweet Baby Angel",
  1410: "Sweet Baby Bear",
  1411: "Tablet of Man",
  1412: "Tadpole",
  1413: "Tai",
  1414: "Tails",
  1415: "TamaElf",
  1416: "Teacup Gheist",
  1417: "Teapot",
  1418: "Technically Advanced RoboMon",
  1419: "Throne of Terabyte",
  1420: "Toad",
  1421: "Toffee",
  1422: "Toji Pocket",
  1423: "Toon Blue Eyes",
  1424: "Toybox",
  1425: "Trio",
  1426: "Trippy Teleworker",
  1427: "Trunk Scry",
  1428: "Twinkle Star",
  1429: "Tyclone",
  1430: "Uap Star",
  1431: "Undead Dire Soldier",
  1432: "Vamp",
  1433: "Voxel Kid",
  1434: "Vril",
  1435: "Wafleer Gold Tyke",
  1436: "Wallaz Wiz",
  1437: "War-torn Star",
  1438: "Warped Wiley",
  1439: "Watercolor Milady",
  1440: "Welf",
  1441: "Whisker",
  1442: "Whist",
  1443: "Whistling Gold Cash",
  1444: "White Gummy Star",
  1445: "White Jest",
  1446: "Wickz Boy",
  1447: "Wickz",
  1448: "Wink",
  1449: "Winrar",
  1450: "Wizard of Aces",
  1451: "Wizard",
  1452: "Worker Son",
  1453: "Worker Ten",
  1454: "Worry",
  1455: "Yao",
  1456: "Yellow Star",
  1457: "YinYang",
  1458: "Young Albino",
  1459: "Young Child Cannon Loader",
  1460: "Yugi Scarecrow",
  1461: "Z Class Drainer",
  1462: "Zebra Cloud Gabber",
  1463: "Zig",
  1464: "Zinc",
  1465: "Zombie Star",
  1466: "Zorn",
};

const minRating = 1200;
const maxRating = 1900;
const maxRatingDifference = 50;
const swagpackIds = Object.keys(swagpackNames).map((value) => Number(value));

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function sanitizeName(name, id) {
  const cleaned = String(name ?? "").replace(/[^a-z0-9]/gi, "");
  if (cleaned.length > 0) {
    return cleaned;
  }
  return `Swagpack${id}`;
}

function pickRandomSwagpack(excludedIds) {
  const blocked = excludedIds ? new Set(excludedIds) : new Set();
  const available = swagpackIds.filter((id) => !blocked.has(id));
  if (available.length === 0) {
    throw new Error("No available swagpacks to choose from.");
  }
  const randomIndex = randomInt(0, available.length - 1);
  const id = available[randomIndex];
  const name = swagpackNames[id];
  const username = sanitizeName(name, id);
  return { id, name, username, emoji: id };
}

function generateRatings() {
  const primary = randomInt(minRating, maxRating);
  let secondary = primary + randomInt(-maxRatingDifference, maxRatingDifference);
  secondary = clamp(secondary, minRating, maxRating);
  if (Math.abs(secondary - primary) > maxRatingDifference) {
    secondary = clamp(primary + (secondary > primary ? maxRatingDifference : -maxRatingDifference), minRating, maxRating);
  }
  return [primary, secondary];
}

function createPlayers() {
  const [ratingOne, ratingTwo] = generateRatings();
  const first = pickRandomSwagpack();
  const second = pickRandomSwagpack([first.id]);
  const playerOne = {
    ...first,
    rating: ratingOne,
    displayName: getDisplayNameFromAddress(first.username, "", "", ratingOne, first.emoji),
  };
  const playerTwo = {
    ...second,
    rating: ratingTwo,
    displayName: getDisplayNameFromAddress(second.username, "", "", ratingTwo, second.emoji),
  };
  return [playerOne, playerTwo];
}

function buildMatchMessage(playerOne, playerTwo) {
  const matchLine = buildEmojiSafeLink(`${playerOne.displayName} vs. ${playerTwo.displayName}`, defaultLink);
  return `${matchLine}`;
}

function createMatchMessage() {
  const [playerOne, playerTwo] = createPlayers();
  return { message: buildMatchMessage(playerOne, playerTwo), playerOne, playerTwo };
}

async function main() {
  const emojiSuffix = getTelegramEmojiTag("5355002036817525409");
  const sendWithLog = async (message) => {
    console.log(message);
    await sendBotMessage(message, false, true, 17258150);
  };
  const sleep = () =>
    new Promise((resolve) => {
      setTimeout(resolve, 3000);
    });
  const sendLookingMessage = async () => {
    const swagpack = pickRandomSwagpack();
    const [rating] = generateRatings();
    const name = getDisplayNameFromAddress(swagpack.username, "", "", rating, swagpack.emoji);
    const message = `${name} is looking for a match https://mons.link ${emojiSuffix}`;
    await sendWithLog(message);
  };
  await sendLookingMessage();
  await sleep();
  for (let index = 0; index < 10; index += 1) {
    const { message } = createMatchMessage();
    await sendWithLog(message);
    if (index < 9) {
      await sleep();
    }
  }
  await sleep();
  await sendLookingMessage();
}

module.exports = swagpackNames;

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
