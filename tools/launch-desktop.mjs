import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";

if (!process.env.electron_config_cache) {
  process.env.electron_config_cache = fileURLToPath(new URL("../.cache/electron-download", import.meta.url));
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const electron = createRequire(import.meta.url)("electron");
const app = fileURLToPath(new URL("../apps/desktop/main.mjs", import.meta.url));
function launch(args) {
  return new Promise((resolve) => {
    const child = spawn(electron, [app, ...args], { env, stdio: "inherit", windowsHide: true });
    child.on("error", () => { console.error("The local Electron runtime could not start."); resolve(1); });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--smoke-test") {
  const cache = fileURLToPath(new URL("../.cache", import.meta.url));
  mkdirSync(cache, { recursive: true });
  const root = realpathSync(cache);
  const profile = mkdtempSync(join(root, "desktop-restore-"));
  env.PAWMETRY_RESTORE_PROFILE = basename(profile);
  try {
    const result = await launch(args);
    process.exitCode = result || await launch(["--smoke-restored-layout"]);
  } finally {
    const actual = realpathSync(profile);
    if (dirname(actual) === root && /^desktop-restore-[A-Za-z0-9]{6}$/.test(basename(actual))) {
      try { rmSync(actual, { recursive: true, force: true }); } catch { /* Chromium may still hold scratch files. */ }
    }
  }
} else {
  process.exitCode = await launch(args);
}
