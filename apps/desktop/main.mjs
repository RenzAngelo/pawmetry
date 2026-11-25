import { app, BrowserWindow, Menu, nativeImage, Notification, screen, Tray } from "electron";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as wait } from "node:timers/promises";
import { scenarios, simulate } from "../../packages/simulation/scenarios.ts";
import { createLiveQuota } from "./live-quota.ts";
import { windowsEndpoint } from "../../packages/ipc/discovery.ts";
import { askStatus, listenStatus } from "../../packages/ipc/transport.ts";
import { nonce } from "../../packages/ipc/protocol.ts";
import { resetText } from "../../packages/telemetry/time-display.ts";
import { animationStyle, motionFor } from "../../packages/animation/animation.ts";
import { fitBounds, loadPreferences, savePreferences } from "./preferences.ts";
import { quotaAlerts } from "./quota-alerts.ts";

const liveSmoke = process.argv.includes("--smoke-live");
const smoke = liveSmoke || process.argv.includes("--smoke-test");
const lockSmoke = process.argv.includes("--smoke-lock");
const local = (file) => fileURLToPath(new URL(file, import.meta.url));
const cache = local("../../.cache/");
if (lockSmoke || smoke) mkdirSync(cache, { recursive: true });
const testId = process.env.PAWMETRY_LOCK_TEST_ID;
if (lockSmoke && (!testId || !/^[a-f0-9]{32}$/.test(testId))) throw new Error("Expected an isolated lock test ID");
const userData = lockSmoke ? join(cache, "desktop-lock-" + testId)
  : smoke ? mkdtempSync(join(cache, "desktop-smoke-")) : join(app.getPath("appData"), "Pawmetry");
mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);
if (smoke) app.on("quit", () => {
  try { rmSync(userData, { recursive: true, force: true }); } catch { /* Windows may still be closing Chromium files. */ }
});
let window;
let tray;
let timer;
let scenario = 0;
let scenarioAt = Date.now();
let paused = false;
let clickThroughItem;
let endpointTask;
let closing = false;
let saveTimer;
let notice;
const live = createLiveQuota();
const preferencePath = join(userData, "companion.json");
const preferences = loadPreferences(preferencePath);
const takeAlerts = quotaAlerts();

function paint() {
  if (!window || window.isDestroyed()) return;
  const { status, pet } = live.view();
  const simulation = status.mode === "simulation";
  const now = Date.now();
  const sample = simulation ? simulate(scenarios[scenario], scenarioAt) : null;
  const shown = sample?.pet ?? pet;
  const assumed = (slot) => sample?.quota?.windows.find((item) => item.slot === slot)?.resetsAtMs ?? null;
  window.webContents.send("pawmetry:view", {
    pet: shown, motion: animationStyle(shown, motionFor(shown.pose), paused || preferences.reducedMotion),
    mode: status.mode, quota: status.quota,
    notice: status.quota === "fresh" && notice && notice.expires > now ? notice.message : "",
    resets: {
      energy: resetText(simulation ? assumed("energy") : status.energy.resetAt, now),
      stamina: resetText(simulation ? assumed("stamina") : status.stamina.resetAt, now),
    },
  });
}

function advance() {
  if (live.view().status.mode !== "simulation") return;
  scenario = (scenario + 1) % scenarios.length;
  scenarioAt = Date.now();
  paint();
}

async function startEndpoint() {
  if (process.platform !== "win32") return null;
  const existing = await windowsEndpoint("read");
  if (existing && await askStatus(existing, "show").catch(() => null)) {
    // Covers side-by-side executable names that Electron can give different native locks.
    queueMicrotask(() => app.quit());
    return null;
  }
  const server = await listenStatus((op) => {
    if (op === "refresh") live.refresh(true);
    if (op === "show") recover();
    if (op === "hide") window?.hide();
    return live.view().status;
  });
  try {
    await windowsEndpoint("publish", server.endpoint, undefined, existing);
    return server;
  } catch {
    await server.close();
    const winner = await windowsEndpoint("read").catch(() => null);
    if (winner && await askStatus(winner, "show").catch(() => null)) {
      queueMicrotask(() => app.quit());
      return null;
    }
    console.error("Pawmetry IPC discovery is unavailable.");
    return null;
  }
}

async function smokeLive() {
  const namespace = nonce().slice(0, 32);
  const server = await listenStatus(() => live.view().status);
  try {
    await windowsEndpoint("publish", server.endpoint, namespace);
    const endpoint = await windowsEndpoint("read", undefined, namespace);
    if (!endpoint || (await askStatus(endpoint, "status")).mode !== "simulation") return false;
    live.enable();
    const deadline = performance.now() + 18_000;
    while (performance.now() < deadline) {
      const snapshot = await askStatus(endpoint, "status");
      if (snapshot.quota === "fresh") {
        paint();
        await wait(120);
        return window.webContents.executeJavaScript(
          "document.querySelector('#mode').textContent === 'Live Codex' && "
          + "['#energy-text', '#stamina-text'].some(id => document.querySelector(id).textContent.endsWith('%'))",
        );
      }
      await wait(250);
    }
    return false;
  } finally {
    await live.disable();
    await server.close();
    await windowsEndpoint("clear", server.endpoint, namespace).catch(() => {});
  }
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
  const safe = fitBounds(bounds, area);
  if (safe.x !== bounds.x || safe.y !== bounds.y || safe.width !== bounds.width || safe.height !== bounds.height) {
    window.setBounds(safe);
  }
}

function persist() {
  clearTimeout(saveTimer);
  if (closing || !window || window.isDestroyed()) return;
  // A transient motion event can fire repeatedly while dragging.
  preferences.bounds = window.getBounds();
  saveTimer = setTimeout(() => savePreferences(preferencePath, preferences), 250);
}

function checkNotices() {
  const alerts = takeAlerts(live.view().status, preferences.lowQuotaAlerts);
  if (alerts.length) {
    const message = alerts.map((alert) =>
      `${alert.meter === "energy" ? "Energy" : "Stamina"} at ${alert.remaining}%`).join(" · ");
    notice = { message, expires: Date.now() + 9000 };
    if (Notification.isSupported()) new Notification({ title: "Pawmetry quota", body: message, silent: true }).show();
  }
}

async function start() {
  await app.whenReady();
  if (!smoke && process.platform === "win32") app.setAppUserModelId(process.execPath);
  const { workArea } = screen.getPrimaryDisplay();
  const wanted = preferences.bounds ?? { width: 292, height: 320, x: workArea.x + workArea.width - 312, y: workArea.y + 24 };
  const initial = fitBounds(wanted, screen.getDisplayMatching(wanted).workArea);
  window = new BrowserWindow({
    ...initial,
    transparent: true, frame: false, alwaysOnTop: preferences.alwaysOnTop, skipTaskbar: true, resizable: false, show: false,
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
  if (liveSmoke) {
    const passed = await smokeLive();
    console.log(passed ? "Desktop live quota, authenticated IPC, and renderer smoke passed." : "Desktop live smoke failed.");
    app.exit(passed ? 0 : 1);
    return;
  }
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
  endpointTask = startEndpoint().catch(() => null);
  tray = new Tray(trayIcon());
  tray.setToolTip("Pawmetry");
  const menu = Menu.buildFromTemplate([
    { label: "Show or hide", click: () => window.isVisible() ? window.hide() : recover() },
    { label: "Live Codex quota", type: "checkbox", click: (item) => {
      if (item.checked) live.enable();
      else { live.disable(); notice = undefined; scenarioAt = Date.now(); }
      paint();
    } },
    { label: "Refresh live quota", click: () => live.refresh(true) },
    { label: "Pause", type: "checkbox", click: (item) => { paused = item.checked; paint(); } },
    { label: "Next scenario", click: advance },
    { label: "Always on top", type: "checkbox", checked: preferences.alwaysOnTop, click: (item) => {
      preferences.alwaysOnTop = item.checked; window.setAlwaysOnTop(item.checked); persist();
    } },
    { label: "Reduced motion", type: "checkbox", checked: preferences.reducedMotion, click: (item) => {
      preferences.reducedMotion = item.checked; persist(); paint();
    } },
    { label: "Low-quota notifications", type: "checkbox", checked: preferences.lowQuotaAlerts, click: (item) => {
      preferences.lowQuotaAlerts = item.checked;
      if (!item.checked) { notice = undefined; paint(); }
      persist();
    } },
    { label: "Window size", submenu: [
      { label: "Compact", type: "radio", checked: initial.width === 264, click: () => resize(264, 300) },
      { label: "Standard", type: "radio", checked: initial.width !== 264 && initial.width !== 356, click: () => resize(292, 320) },
      { label: "Large", type: "radio", checked: initial.width === 356, click: () => resize(356, 368) },
    ] },
    { id: "click-through", label: "Click-through", type: "checkbox", click: (item) => {
      window.setIgnoreMouseEvents(item.checked);
    } },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  clickThroughItem = menu.getMenuItemById("click-through");
  tray.setContextMenu(menu);
  tray.on("double-click", recover);
  window.on("move", persist);
  window.on("resize", persist);
  screen.on("display-removed", keepOnDisplay);
  screen.on("display-metrics-changed", keepOnDisplay);
  window.showInactive();
  let lastScenario = Date.now();
  timer = setInterval(() => {
    live.refresh();
    checkNotices();
    if (!window.isVisible()) return;
    if (!paused && Date.now() - lastScenario >= 4500) {
      lastScenario = Date.now();
      advance();
    }
    paint();
  }, 1000);
}

function recover() {
  if (!window || window.isDestroyed()) return;
  if (clickThroughItem) clickThroughItem.checked = false;
  window.setIgnoreMouseEvents(false);
  keepOnDisplay();
  window.showInactive();
  paint();
}

function resize(width, height) {
  window.setSize(width, height);
  keepOnDisplay();
}

if (lockSmoke) {
  if (app.requestSingleInstanceLock()) {
    const timeout = setTimeout(() => app.exit(1), 8000);
    app.once("second-instance", () => {
      clearTimeout(timeout);
      console.log("Second desktop launch reached the primary instance.");
      // Leave the lock held while Electron returns the result to the second process.
      setTimeout(() => app.exit(0), 1200);
    });
    void app.whenReady().then(() => console.log("Desktop lock ready."));
  } else {
    console.log("Second desktop launch exited without a lock.");
    app.quit();
  }
} else if (smoke || app.requestSingleInstanceLock()) {
  app.on("second-instance", recover);
  app.on("before-quit", (event) => {
    if (closing || !endpointTask) return;
    event.preventDefault();
    closing = true;
    clearInterval(timer);
    clearTimeout(saveTimer);
    if (window && !window.isDestroyed()) preferences.bounds = window.getBounds();
    savePreferences(preferencePath, preferences);
    const stopping = live.disable();
    const closingEndpoint = endpointTask.then(async (server) => {
      if (!server) return;
      await server.close();
      await windowsEndpoint("clear", server.endpoint).catch(() => {});
    });
    void Promise.allSettled([stopping, closingEndpoint]).then(() => app.quit());
  });
  app.on("will-quit", () => { clearInterval(timer); tray?.destroy(); });
  start().catch(() => {
    console.error("The Pawmetry simulation window could not start.");
    app.exit(1);
  });
} else {
  app.quit();
}
