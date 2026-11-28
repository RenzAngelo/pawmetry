import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { once } from "node:events";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const here = (file) => join(root, file);
const catReview = process.argv.includes("--cat-review");
const bundledCompanion = process.argv.includes("--bundle-companion");
const publicRelease = process.argv.includes("--public-release");
const brand = "assets/branding/pawmetry";
const version = JSON.parse(await readFile(here("package.json"), "utf8")).version;
const extensionManifest = JSON.parse(await readFile(here("apps/vscode/package.json"), "utf8"));
if (publicRelease) {
  if (!bundledCompanion || catReview || !process.argv.includes("--package")) throw new Error("Public release must be a bundled production VSIX.");
  if (extensionManifest.version !== version) throw new Error("Desktop and extension versions must match.");
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(extensionManifest.publisher ?? "") || extensionManifest.publisher.toLowerCase() === "pawmetry-local") {
    throw new Error("Set the approved Marketplace publisher before preparing the public VSIX.");
  }
  if (!extensionManifest.repository?.url?.startsWith("https://") || !extensionManifest.bugs?.url?.startsWith("https://")) {
    throw new Error("Set the public repository and issue tracker links before preparing the public VSIX.");
  }
  if (extensionManifest.license !== "MIT" || !(await readFile(here("LICENSE"), "utf8").catch(() => "")).trim()) {
    throw new Error("Add the approved source license before preparing the public VSIX.");
  }
  if (!(await readFile(here("assets/mascots/cat/DISTRIBUTION.md"), "utf8").catch(() => "")).trim()) {
    throw new Error("Record Cat’s approved redistribution terms before preparing the public VSIX.");
  }
}
const out = here("dist");
await mkdir(out, { recursive: true });
const build = await mkdtemp(join(out, "pawmetry-"));
const desktopApp = join(build, "desktop-app");
const editor = join(build, "extension");

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
await copy(["app.png", "tray-dark.png", "tray-light.png", "logo-dark.svg", "logo-light.svg"].map((name) => `${brand}/${name}`), desktopApp);
const icons = ["activity", "bell", "check", "chevron-right", "ellipsis", "flask-conical", "info", "keyboard", "layout-dashboard", "link",
  "log-out", "minus", "mouse-pointer-2", "palette", "panel-top", "pause", "pin", "play", "refresh-cw", "settings", "sliders-horizontal", "square"];
await copy([...icons.map((name) => `apps/desktop/icons/${name}.svg`), "apps/desktop/icons/LICENSE", "apps/desktop/icons/LICENSE.feather"], desktopApp);
await copy([
  "apps/desktop/index.html", "apps/desktop/live-quota.ts", "apps/desktop/main.mjs",
  "apps/desktop/preferences.ts", "apps/desktop/preload.cjs",
  "apps/desktop/renderer.js", "apps/desktop/style.css", "packages/animation/animation.ts", "packages/animation/sprite-atlas.ts",
  "apps/desktop/mascot.mjs",
  "apps/desktop/local-window.mjs", "apps/desktop/settings-window.mjs", "apps/desktop/settings-model.ts",
  "apps/desktop/settings-preload.cjs", "apps/desktop/settings.html", "apps/desktop/settings.js", "apps/desktop/settings.css",
  "apps/desktop/tokens.css",
  "apps/desktop/menu-window.mjs", "apps/desktop/menu-preload.cjs", "apps/desktop/menu.html", "apps/desktop/menu.js", "apps/desktop/menu.css",
  "packages/telemetry/quota-manager.ts", "tools/codex-quota-probe/app-server.ts",
  "tools/codex-quota-probe/discovery.ts", "tools/codex-quota-probe/quota.ts", "tools/codex-quota-probe/telemetry.ts",
  "THIRD_PARTY_NOTICES.md",
], desktopApp);
if (catReview || publicRelease) await copy(["assets/mascots/cat/sprites.png", "assets/mascots/cat/atlas.json"], desktopApp);
await writeFile(join(desktopApp, "package.json"),
  JSON.stringify({ name: "pawmetry", productName: "Pawmetry", version, type: "module", main: "apps/desktop/main.mjs", private: true }));
const fingerprint = createHash("sha256");
const staged = (await readdir(desktopApp, { recursive: true, withFileTypes: true })).filter((item) => item.isFile())
  .map((item) => join(item.parentPath, item.name)).sort();
for (const file of staged) {
  fingerprint.update(file.slice(desktopApp.length).replaceAll("\\", "/"));
  fingerprint.update(createHash("sha256").update(await readFile(file)).digest());
}
let revision = "unversioned";
try {
  revision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).trim();
} catch { /* Archives without Git still have a content fingerprint. */ }
const buildInfo = { version, revision, fingerprint: fingerprint.digest("hex").slice(0, 12), ...(catReview ? { catReview: true } : {}),
  ...(bundledCompanion ? { bundledCompanion: true } : {}) };
await writeFile(join(desktopApp, "build-info.json"), JSON.stringify(buildInfo) + "\n");
console.log(`Desktop build ${version} ${revision} ${buildInfo.fingerprint}`);
await copy(common, join(editor, "shared"));
await writeFile(join(editor, "shared", "package.json"), '{"type":"module"}\n');
await cp(here("apps/vscode/extension.cjs"), join(editor, "extension.cjs"));
await cp(here("apps/vscode/companion.cjs"), join(editor, "companion.cjs"));
extensionManifest.icon = "icon.png";
await cp(here(`${brand}/app.png`), join(editor, extensionManifest.icon));
if (bundledCompanion) extensionManifest.contributes.commands = extensionManifest.contributes.commands
  .filter(({ command }) => !["pawmetry.nextSimulation", "pawmetry.stopSimulation"].includes(command));
await writeFile(join(editor, "package.json"), JSON.stringify(extensionManifest, null, 2) + "\n");
await cp(here("THIRD_PARTY_NOTICES.md"), join(editor, "THIRD_PARTY_NOTICES.md"));
if (publicRelease) {
  await copy(["LICENSE", "ARTWORK.md", "assets/mascots/cat/DISTRIBUTION.md"], editor);
  await cp(here("apps/vscode/README.md"), join(editor, "README.md"));
} else await writeFile(join(editor, "README.md"), bundledCompanion
  ? "# Pawmetry Windows single-install preview\n\nLeft-click **Start Pawmetry** in the bottom VS Code status bar. After the first-start confirmation, Pawmetry connects to live Codex account quota. Manage quota access in **Settings → Connections**. Prompt activity is coming in a future build. Exit Pawmetry from the tray before uninstalling the extension.\n"
  : "# Pawmetry Public Preview\n\nLocal Codex quota indicators for the Pawmetry Windows companion. Extract the companion ZIP, open Pawmetry.exe, and enable Live Codex quota from the tray.\n");
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
  const runtime = bundledCompanion ? join(editor, "companion") : join(build, "Pawmetry");
  await cp(dirname(electronPath), runtime, { recursive: true, errorOnExist: true });
  const executable = join(runtime, "Pawmetry.exe");
  await rename(join(runtime, "electron.exe"), executable);
  await applyWindowsIcon(executable);
  await disableDevelopmentFuses(executable);
  await unlink(join(runtime, "resources", "default_app.asar"));
  await cp(desktopApp, join(runtime, "resources", "app"), { recursive: true, errorOnExist: true });
  const zip = join(build, `Pawmetry-${version}-win32-x64-${catReview ? "cat-review" : "preview"}.zip`);
  const vsix = join(build, `Pawmetry-${version}-${bundledCompanion ? `win32-x64-single-install${catReview ? "-cat-review" : ""}` : "preview"}.vsix`);
  const ps = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (bundledCompanion) {
    await writeFile(join(editor, "companion-build.json"), JSON.stringify({ version, fingerprint: buildInfo.fingerprint,
      executableSha256: createHash("sha256").update(await readFile(executable)).digest("hex") }));
  } else await run(ps, ["-NoProfile", "-NonInteractive", "-File", here("tools/zip-portable.ps1"), runtime, zip]);
  if (!catReview || bundledCompanion) {
    if (!process.env.npm_execpath) throw new Error("Run local packaging through npm");
    await run(process.execPath, [process.env.npm_execpath, "exec", "--yes", "--cache", here(".npm"),
      "--package=@vscode/vsce@4.1.1", "--", "vsce", "package", "--no-dependencies",
      ...(publicRelease ? [] : ["--allow-missing-repository", "--skip-license"]),
      ...(bundledCompanion ? ["--target", "win32-x64", "--pre-release"] : []), "--out", vsix], { cwd: editor });
  }
  const checksums = await Promise.all((bundledCompanion ? [vsix] : catReview ? [zip] : [zip, vsix]).map(async (path) => {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return `${hash.digest("hex")}  ${path.slice(build.length + 1)}`;
  }));
  await writeFile(join(build, "SHA256SUMS.txt"), checksums.join("\n") + "\n");
  if (!catReview || bundledCompanion) await run(ps, ["-NoProfile", "-NonInteractive", "-File", here("tools/audit-preview.ps1"), build,
    ...(bundledCompanion ? ["-SingleInstall"] : []), ...(catReview ? ["-CatReview"] : []), ...(publicRelease ? ["-PublicRelease"] : [])]);
  console.log(`Local artifacts created in ${build}`);
}

async function disableDevelopmentFuses(path) {
  // Electron's documented fuse wire. Fail closed if a runtime update changes its layout.
  const sentinel = Buffer.from("dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX");
  const image = await readFile(path);
  const start = image.indexOf(sentinel);
  const wire = start + sentinel.length + 2;
  if (start < 0 || image.indexOf(sentinel, start + 1) !== -1 || image[wire - 2] !== 1 || image[wire - 1] < 4) {
    throw new Error("Unknown Electron fuse layout");
  }
  // RunAsNode, EnableNodeOptionsEnvironmentVariable, EnableNodeCliInspectArguments.
  for (const flag of [0, 2, 3]) {
    if (image[wire + flag] !== 0x31) throw new Error("Unexpected Electron fuse value");
    image[wire + flag] = 0x30;
  }
  await writeFile(path, image);
}

async function applyWindowsIcon(path) {
  const { Data, NtExecutable, NtExecutableResource, Resource } = await import("resedit");
  const binary = NtExecutable.from(await readFile(path), { ignoreCert: true });
  const resources = NtExecutableResource.from(binary);
  const [group, ...otherGroups] = Resource.IconGroupEntry.fromEntries(resources.entries);
  if (!group || otherGroups.length) throw new Error("Unexpected Electron executable icon groups");
  const artwork = Data.IconFile.from(await readFile(here(`${brand}/app.ico`)));
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, artwork.icons.map(({ data }) => data));
  resources.outputResource(binary);
  await writeFile(path, Buffer.from(binary.generate()));
}
