import { app, BrowserWindow, Menu, nativeImage, screen, Tray } from "electron";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scenarios, simulate } from "../../packages/simulation/scenarios.ts";

const smoke = process.argv.includes("--smoke-test");
const local = (file) => fileURLToPath(new URL(file, import.meta.url));
const cache = local("../../.cache/");
mkdirSync(cache, { recursive: true });
const userData = smoke ? mkdtempSync(join(cache, "desktop-smoke-")) : join(cache, "desktop-simulation");
mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);
if (smoke) app.on("quit", () => {
  try { rmSync(userData, { recursive: true, force: true }); } catch { /* Windows may still be closing Chromium files. */ }
});
let window;
let tray;
let timer;
let scenario = 0;
let paused = false;

function paint() {
  if (!window || window.isDestroyed()) return;
  window.webContents.send("pawmetry:simulation", { pet: simulate(scenarios[scenario]).pet, paused });
}

function advance() {
  scenario = (scenario + 1) % scenarios.length;
  paint();
}

function trayIcon() {
  const size = 16;
  const bgra = Buffer.alloc(size * size * 4);
  for (let y = 2; y < 14; y++) {
    for (let x = 2; x < 14; x++) {
      const pixel = (y * size + x) * 4;
      const eye = y >= 6 && y < 10 && (x === 5 || x === 10);
      bgra.set(eye ? [58, 37, 19, 255] : [203, 207, 106, 255], pixel);
    }
  }
  return nativeImage.createFromBitmap(bgra, { width: size, height: size });
}

function keepOnDisplay() {
  if (!window || window.isDestroyed()) return;
  const bounds = window.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width));
  const y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height));
  if (x !== bounds.x || y !== bounds.y) window.setPosition(x, y);
}

async function start() {
  await app.whenReady();
  const { workArea } = screen.getPrimaryDisplay();
  window = new BrowserWindow({
    width: 292, height: 320, x: workArea.x + workArea.width - 312, y: workArea.y + 24,
    transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, show: false,
    webPreferences: { preload: local("preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false,
      partition: "pawmetry-simulation", backgroundThrottling: !smoke },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] },
    (_details, callback) => callback({ cancel: true }));
  await window.loadFile(local("index.html"));
  paint();
  if (smoke) {
    const check = await window.webContents.executeJavaScript(`new Promise((resolve) => {
      const check = () => {
        const label = document.querySelector('#pose').textContent;
        if (label === 'Energetic') resolve(true);
        else requestAnimationFrame(check);
      };
      check();
      setTimeout(() => resolve(false), 1500);
    })`);
    console.log(check ? "Desktop simulation renderer smoke passed." : "Desktop simulation renderer smoke failed.");
    app.exit(check ? 0 : 1);
    return;
  }
  tray = new Tray(trayIcon());
  tray.setToolTip("Pawmetry simulation");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show or hide", click: () => window.isVisible() ? window.hide() : window.showInactive() },
    { label: "Pause", type: "checkbox", click: (item) => { paused = item.checked; paint(); } },
    { label: "Next scenario", click: advance },
    { label: "Click-through", type: "checkbox", click: (item) => {
      window.setIgnoreMouseEvents(item.checked);
    } },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]));
  tray.on("double-click", () => window.showInactive());
  screen.on("display-removed", keepOnDisplay);
  screen.on("display-metrics-changed", keepOnDisplay);
  window.showInactive();
  timer = setInterval(() => { if (!paused && window.isVisible()) advance(); }, 4500);
}

if (smoke || app.requestSingleInstanceLock()) {
  app.on("second-instance", () => window?.showInactive());
  app.on("will-quit", () => { clearInterval(timer); tray?.destroy(); });
  start().catch(() => {
    console.error("The Pawmetry simulation window could not start.");
    app.exit(1);
  });
} else {
  app.quit();
}
