const http = require("http");
const net = require("net");
const { spawn, spawnSync } = require("child_process");

const port = Number.parseInt(process.env.PORT || "3000", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be a number between 1 and 65535.');
  process.exit(1);
}

const localUrl = `http://127.0.0.1:${port}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

let appProcess = null;
let tunnelProcess = null;
let shuttingDown = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttpReady() {
  return new Promise((resolve) => {
    const request = http.get(localUrl, (response) => {
      response.resume();
      resolve(true);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function isPortOccupied() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("error", (error) => {
      if (error.code === "ECONNREFUSED") {
        resolve(false);
        return;
      }

      resolve(true);
    });

    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(true);
    });
  });
}

function verifyCloudflared() {
  const result = spawnSync("cloudflared", ["--version"], { stdio: "ignore" });

  if (result.status === 0) {
    return;
  }

  console.error('cloudflared is required. Install it with "brew install cloudflared".');
  process.exit(1);
}

function spawnProcess(command, args, env = process.env) {
  return spawn(command, args, {
    stdio: "inherit",
    env,
    detached: process.platform !== "win32",
  });
}

function terminateProcess(child, signal = "SIGTERM") {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    child.kill(signal);
    return;
  }

  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") {
      throw error;
    }
  }
}

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  terminateProcess(tunnelProcess);
  terminateProcess(appProcess);

  setTimeout(() => {
    terminateProcess(tunnelProcess, "SIGKILL");
    terminateProcess(appProcess, "SIGKILL");
    process.exit(exitCode);
  }, 2000).unref();
}

function handleChildExit(childName, code) {
  if (shuttingDown) {
    return;
  }

  console.error(`${childName} exited${typeof code === "number" ? ` with code ${code}` : ""}.`);

  if (appProcess || tunnelProcess) {
    shutdown(typeof code === "number" ? code : 1);
    return;
  }

  process.exit(typeof code === "number" ? code : 1);
}

async function waitForApp() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await isHttpReady()) {
      return true;
    }

    if (appProcess && appProcess.exitCode !== null) {
      return false;
    }

    await delay(1000);
  }

  return false;
}

function startTunnel() {
  console.log(`Starting Cloudflare tunnel for ${localUrl}`);
  tunnelProcess = spawnProcess("cloudflared", ["tunnel", "--url", localUrl]);

  tunnelProcess.on("exit", (code) => {
    tunnelProcess = null;
    handleChildExit("cloudflared", code);
  });
}

function startApp() {
  console.log(`Starting app on ${localUrl}`);

  appProcess = spawnProcess(npmCommand, ["run", "start"], {
    ...process.env,
    BROWSER: process.env.BROWSER || "none",
  });

  appProcess.on("exit", (code) => {
    appProcess = null;
    handleChildExit("npm run start", code);
  });
}

async function main() {
  verifyCloudflared();

  if (await isHttpReady()) {
    console.log(`Using existing app at ${localUrl}`);
    startTunnel();
    return;
  }

  if (await isPortOccupied()) {
    console.error(
      `Port ${port} is already in use, but ${localUrl} is not responding over HTTP. Stop the process using that port or start the app separately before running this command.`
    );
    process.exit(1);
  }

  startApp();

  if (!(await waitForApp())) {
    console.error(`Timed out waiting for the app to become available at ${localUrl}.`);
    shutdown(1);
    return;
  }

  startTunnel();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
