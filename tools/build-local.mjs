import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const here = (file) => join(root, file);
const out = here("dist");
await mkdir(out, { recursive: true });
const build = await mkdtemp(join(out, "pawmetry-"));
const desktopApp = join(build, "desktop-app");
const editor = join(build, "extension");
const version = JSON.parse(await readFile(here("package.json"), "utf8")).version;

async function copy(files, target) {
  for (const file of files) {
    const destination = join(target, file);
    await mkdir(dirname(destination), { recursive: true });
    await cp(here(file), destination);
  }
}

const common = [
  "packages/ipc/client.ts", "packages/ipc/discovery.ts", "packages/ipc/protocol.ts",
  "packages/ipc/transport.ts", "packages/ipc/windows-endpoint.ps1",
  "packages/telemetry/model.ts", "packages/telemetry/time-display.ts",
  "packages/simulation/scenarios.ts", "packages/behavior/behavior.ts",
];
await copy(common, desktopApp);
await copy([
  "apps/desktop/index.html", "apps/desktop/live-quota.ts", "apps/desktop/main.mjs",
  "apps/desktop/preferences.ts", "apps/desktop/preload.cjs", "apps/desktop/quota-alerts.ts",
  "apps/desktop/renderer.js", "apps/desktop/style.css", "packages/animation/animation.ts",
  "apps/desktop/local-window.mjs", "apps/desktop/settings-window.mjs", "apps/desktop/settings-model.ts",
  "apps/desktop/settings-preload.cjs", "apps/desktop/settings.html", "apps/desktop/settings.js", "apps/desktop/settings.css",
  "packages/telemetry/quota-manager.ts", "tools/codex-quota-probe/app-server.ts",
  "tools/codex-quota-probe/discovery.ts", "tools/codex-quota-probe/quota.ts", "tools/codex-quota-probe/telemetry.ts",
  "tools/codex-activity-probe/hook.ts", "tools/codex-activity-probe/protocol.ts",
  "tools/codex-activity-probe/receiver.ts", "tools/codex-activity-probe/timeline.ts",
  "THIRD_PARTY_NOTICES.md",
], desktopApp);
await writeFile(join(desktopApp, "package.json"),
  JSON.stringify({ name: "pawmetry", productName: "Pawmetry", version, type: "module", main: "apps/desktop/main.mjs", private: true }));
await copy(common, join(editor, "shared"));
await writeFile(join(editor, "shared", "package.json"), '{"type":"module"}\n');
await cp(here("apps/vscode/extension.cjs"), join(editor, "extension.cjs"));
await cp(here("apps/vscode/package.json"), join(editor, "package.json"));
await cp(here("THIRD_PARTY_NOTICES.md"), join(editor, "THIRD_PARTY_NOTICES.md"));
await writeFile(join(editor, "README.md"), "# Pawmetry development extension\n\nLocal quota indicators and simulation for the Pawmetry companion.\n");
await writeFile(join(editor, ".vscodeignore"), "**/*.log\n");
console.log(`Staged desktop and extension sources in ${build}`);

async function run(program, args, options) {
  const child = spawn(program, args, { ...options, windowsHide: true, stdio: "inherit" });
  const [code] = await once(child, "close");
  if (code !== 0) throw new Error("Local packaging failed");
}

if (process.argv.includes("--package")) {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Local packages target Windows x64");
  process.env.electron_config_cache ??= here(".cache/electron-download");
  const electronPath = createRequire(import.meta.url)("electron");
  const runtime = join(build, "Pawmetry");
  await cp(dirname(electronPath), runtime, { recursive: true, errorOnExist: true });
  await rename(join(runtime, "electron.exe"), join(runtime, "Pawmetry.exe"));
  await cp(desktopApp, join(runtime, "resources", "app"), { recursive: true, errorOnExist: true });
  const zip = join(build, `Pawmetry-${version}-win32-x64-dev.zip`);
  const vsix = join(build, `Pawmetry-${version}-dev.vsix`);
  const ps = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  await run(ps, ["-NoProfile", "-NonInteractive", "-File", here("tools/zip-portable.ps1"), runtime, zip]);
  if (!process.env.npm_execpath) throw new Error("Run local packaging through npm");
  await run(process.execPath, [process.env.npm_execpath, "exec", "--yes", "--cache", here(".npm"),
    "--package=@vscode/vsce@4.1.1", "--", "vsce", "package", "--no-dependencies", "--allow-missing-repository",
    "--skip-license", "--out", vsix], { cwd: editor });
  console.log(`Local artifacts created in ${build}`);
}
