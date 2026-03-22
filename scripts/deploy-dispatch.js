const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function exitWith(result) {
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

if (args.length === 0) {
  const backend = spawnSync(npmCommand, ["run", "deploy:backend"], {
    stdio: "inherit",
    env: process.env,
  });
  exitWith(backend);
}

const frontend = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "scripts/deploy-amplify.ts", ...args],
  {
    stdio: "inherit",
    env: process.env,
  },
);
exitWith(frontend);
