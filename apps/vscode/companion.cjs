const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
const { lstat, readFile, realpath } = require("node:fs/promises");
const { join, dirname, resolve } = require("node:path");
const { setTimeout: wait } = require("node:timers/promises");

const samePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

async function loadCompanion(extensionPath) {
  const root = await realpath(extensionPath);
  const metadata = join(root, "companion-build.json");
  const file = await lstat(metadata);
  if (!file.isFile() || file.isSymbolicLink() || file.size > 4096) throw new Error("Invalid companion metadata");
  const { version, fingerprint, executableSha256 } = JSON.parse(await readFile(metadata, "utf8"));
  if (!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(version) || !/^[a-f0-9]{12}$/.test(fingerprint)
    || !/^[a-f0-9]{64}$/.test(executableSha256)) throw new Error("Invalid companion metadata");
  const directory = join(root, "companion");
  const executable = join(directory, "Pawmetry.exe");
  const info = await lstat(executable);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 512 * 1024 * 1024
    || !samePath(await realpath(directory), directory) || !samePath(await realpath(executable), executable)) {
    throw new Error("Invalid bundled runtime path");
  }
  const digest = createHash("sha256");
  for await (const bytes of createReadStream(executable)) digest.update(bytes);
  if (digest.digest("hex") !== executableSha256) throw new Error("Bundled companion digest mismatch");
  return { executable, version, fingerprint };
}

function launchCompanion(executable) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    /^(SystemRoot|WINDIR|TEMP|TMP|APPDATA|LOCALAPPDATA|USERPROFILE|USERNAME|USERDOMAIN|HOMEDRIVE|HOMEPATH|SYSTEMDRIVE|ProgramFiles(?:\(x86\))?|ProgramData|OS|PROCESSOR_ARCHITECTURE)$/i.test(name)));
  // Windows PowerShell needs this to capture whoami.exe's output under IPC pipes.
  env.PATHEXT = ".EXE";
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["--live-quota"], { cwd: dirname(executable), env, detached: true, shell: false, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

function compareVersions(left, right) {
  const other = right.split(".").map(Number);
  for (const [index, part] of left.split(".").map(Number).entries()) {
    if (part !== other[index]) return Math.sign(part - other[index]);
  }
  return 0;
}

async function startCompanion({ bundle, read, ask, confirm, launch = launchCompanion, pause = wait }) {
  const request = (endpoint, op) => endpoint ? ask(endpoint, op).catch(() => null) : Promise.resolve(null);
  const endpoint = await read();
  if (await request(endpoint, "status")) {
    const running = (await request(endpoint, "identify"))?.build;
    if (!running || compareVersions(running.version, bundle.version) >= 0) {
      await request(endpoint, "show");
      return !running || (running.version === bundle.version && running.fingerprint !== bundle.fingerprint) ? "existing" : "connected";
    }
    if (!await confirm("update")) return "cancelled";
    if (!await request(endpoint, "quit")) return "restart-needed";
    // Wait for shutdown and cleanup. Another editor may have started the new version.
    for (let attempt = 0; attempt < 10; attempt++) {
      await pause(450);
      const current = await read();
      if (!current) break;
      if (current.key !== endpoint.key && await request(current, "status")) {
        const replacement = (await request(current, "identify"))?.build;
        return replacement && compareVersions(replacement.version, bundle.version) >= 0 ? "connected" : "existing";
      }
      if (attempt === 9) return "restart-needed";
    }
  } else if (!await confirm("start")) return "cancelled";

  await launch(bundle.executable);
  for (let attempt = 0; attempt < 12; attempt++) {
    await pause(500);
    const current = await read();
    if (await request(current, "status")) {
      const running = (await request(current, "identify"))?.build;
      return running?.fingerprint === bundle.fingerprint ? "connected" : "existing";
    }
  }
  return "unavailable";
}

module.exports = { loadCompanion, startCompanion };
