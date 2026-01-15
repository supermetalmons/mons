const fs = require("fs");
const path = require("path");

const buildPath = process.env.BUILD_PATH || "build";
const devPath = path.join(process.cwd(), buildPath, "dev");

if (fs.existsSync(devPath)) {
  fs.rmSync(devPath, { recursive: true, force: true });
}
