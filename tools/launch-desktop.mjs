import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

if (!process.env.electron_config_cache) {
  process.env.electron_config_cache = fileURLToPath(new URL("../.cache/electron-download", import.meta.url));
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const electron = createRequire(import.meta.url)("electron");
const app = fileURLToPath(new URL("../apps/desktop/main.mjs", import.meta.url));
const child = spawn(electron, [app, ...process.argv.slice(2)], { env, stdio: "inherit", windowsHide: true });
child.on("error", () => {
  console.error("The local Electron runtime could not start.");
  process.exitCode = 1;
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
