import { app, BrowserWindow, dialog, globalShortcut, Menu, nativeImage, Notification, powerMonitor, screen, Tray } from "electron";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
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
import { dimensions, fitBounds, loadPreferences, modes, savePreferences, shortcuts, sizes } from "./preferences.ts";
import { alertKinds, quotaAlerts } from "./quota-alerts.ts";
import { prepareReceiver } from "../../tools/codex-activity-probe/receiver.ts";

const liveSmoke = process.argv.includes("--smoke-live");
const performanceSmoke = process.argv.includes("--smoke-performance");
const restoreSmoke = process.argv.includes("--smoke-restored-layout");
const layoutSmoke = process.argv.includes("--smoke-test");
const smoke = liveSmoke || performanceSmoke || restoreSmoke || layoutSmoke;
const lockSmoke = process.argv.includes("--smoke-lock");
const local = (file) => fileURLToPath(new URL(file, import.meta.url));
const cache = local("../../.cache/");
if (lockSmoke || smoke) mkdirSync(cache, { recursive: true });
const testId = process.env.PAWMETRY_LOCK_TEST_ID;
if (lockSmoke && (!testId || !/^[a-f0-9]{32}$/.test(testId))) throw new Error("Expected an isolated lock test ID");
const restoreProfile = process.env.PAWMETRY_RESTORE_PROFILE ?? "";
const sharedSmoke = (restoreSmoke || layoutSmoke) && /^desktop-restore-[A-Za-z0-9]{6}$/.test(restoreProfile);
if (restoreSmoke && !sharedSmoke) throw new Error("Expected an isolated restore test profile");
const userData = lockSmoke ? join(cache, "desktop-lock-" + testId)
  : sharedSmoke ? join(cache, restoreProfile)
  : smoke ? mkdtempSync(join(cache, "desktop-smoke-")) : join(app.getPath("appData"), "Pawmetry");
mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);
if (smoke && !sharedSmoke) app.on("quit", () => {
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
let activityTask;
let activityReceiver;
let monitoringPaused = false;
let liveSelected = false;
let mouseIgnored = false;
let hovered = false;
let hitTimer;
let wakeAt = 0;
let settingsMenu;
let controlMenu;
const petScales = { small: 0.8, standard: 1, large: 1.2 };
const live = createLiveQuota();
const preferencePath = join(userData, "companion.json");
const preferences = loadPreferences(preferencePath);
const takeAlerts = quotaAlerts();

function companionView() {
  const view = live.view(monitoringPaused ? "unknown" : activityReceiver?.aggregate());
  if (monitoringPaused && liveSelected) view.status = { ...view.status, mode: "live", quota: "paused" };
  return view;
}

function pauseMonitoring(value) {
  monitoringPaused = value;
  activityReceiver?.setPaused(value);
  if (controlMenu) controlMenu.getMenuItemById("monitoring-pause").checked = value;
  if (monitoringPaused) { void live.disable(); notice = undefined; }
  else if (liveSelected) live.enable();
  paint();
}

function pauseAnimation(value) {
  paused = value;
  if (controlMenu) controlMenu.getMenuItemById("animation-pause").checked = value;
  paint();
}

async function toggleActivity() {
  if (activityTask) return;
  if (activityReceiver) {
    const receiver = activityReceiver;
    activityReceiver = undefined;
    if (!await receiver.close()) dialog.showErrorBox("Pawmetry activity", "An edited disposable hooks.json needs manual removal.");
    paint();
    return;
  }
  activityTask = prepareReceiver({ electron: true, onChange: paint, onError: () => {
    if (activityReceiver) void toggleActivity();
  } });
  try {
    activityReceiver = await activityTask;
    activityReceiver.setPaused(monitoringPaused);
    if (closing) return;
    void dialog.showMessageBox({ title: "Pawmetry activity", message: "Disposable Codex workspaces are ready",
      detail: `Open these folders in separate VS Code windows. Review the generated .codex/hooks.json and use Codex’s native hook review.\n\n${activityReceiver.paths.A}\n${activityReceiver.paths.B}\n\nUse the same tray command to stop and remove unchanged hook files.` });
  } catch {
    dialog.showErrorBox("Pawmetry activity", "The disposable activity receiver could not start.");
  } finally {
    activityTask = undefined;
    paint();
  }
}

function paint() {
  if (!window || window.isDestroyed()) return;
  const { status, pet } = companionView();
  const simulation = status.mode === "simulation";
  const now = Date.now();
  const sample = simulation && !monitoringPaused ? simulate(scenarios[scenario], scenarioAt) : null;
  const shown = sample && (status.activity === "working" || status.activity === "interrupted")
    ? { ...sample.pet, pose: pet.pose } : sample?.pet ?? pet;
  const motion = animationStyle(shown, motionFor(shown.pose), paused || preferences.reducedMotion);
  const assumed = (slot) => sample?.quota?.windows.find((item) => item.slot === slot)?.resetsAtMs ?? null;
  window.webContents.send("pawmetry:view", {
    pet: shown, motion: { ...motion, width: motion.width * petScales[preferences.petSize],
      height: motion.height * petScales[preferences.petSize], durationMs: Math.round(motion.durationMs / preferences.speed) },
    mode: status.mode, quota: status.quota, activity: status.activity, observing: !!activityReceiver,
    presentation: { mode: preferences.mode, background: preferences.backgroundOpacity, opacity: preferences.petOpacity,
      energy: preferences.energyBar, stamina: preferences.staminaBar, hover: preferences.hoverInfo, hovered,
      roaming: preferences.roaming && !motion.frozen && shown.speed > 0 && ["walking", "running", "slow-walking"].includes(motion.motion),
      monitoringPaused },
    notice: notice && notice.expires > now && (notice.test || status.quota === "fresh") ? notice.message : "",
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
    if (op === "hide") setVisible(false);
    if (op === "pause-monitoring" || op === "resume-monitoring") pauseMonitoring(op === "pause-monitoring");
    if (op === "pause-animation" || op === "resume-animation") pauseAnimation(op === "pause-animation");
    if (op === "settings") openSettings();
    if (op === "quit") setTimeout(() => app.quit(), 150);
    return companionView().status;
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

async function smokeActivity() {
  const receiver = await prepareReceiver({ electron: true, onChange: paint });
  activityReceiver = receiver;
  async function deliver(folder, name) {
    const command = JSON.parse(readFileSync(join(folder, ".codex", "hooks.json"), "utf8")).hooks[name][0].hooks[0].command;
    const shell = join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const child = spawn(shell, ["-NoProfile", "-NonInteractive", "-Command", command],
      { windowsHide: true, stdio: ["pipe", "ignore", "ignore"], timeout: 3500 });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ hook_event_name: name, session_id: "fixture", turn_id: "fixture" }) + "\n");
    const [code] = await once(child, "close");
    assert.equal(code, 0, "synthetic generated hook command exited successfully");
  }
  try {
    window.hide();
    await Promise.all(Object.values(receiver.paths).map((folder) => deliver(folder, "PreModelRequest")));
    assert.deepEqual(receiver.states().map((item) => item.workspace).sort(), ["A", "B"]);
    assert.equal(companionView().status.activity, "working");
    window.showInactive();
    assert.match(await window.webContents.executeJavaScript("document.querySelector('#activity').textContent"), /working/);
    await deliver(receiver.paths.A, "Interrupt");
    assert.equal(companionView().status.activity, "working", "the other workspace is still working");
    await deliver(receiver.paths.B, "PostModelRequest");
    assert.equal(companionView().status.activity, "interrupted");
    pauseMonitoring(true);
    await deliver(receiver.paths.B, "PreModelRequest");
    assert.equal(receiver.aggregate(), "unknown");
    pauseMonitoring(false);
    await deliver(receiver.paths.B, "PreModelRequest");
    assert.equal(receiver.aggregate(), "working");
  } finally {
    activityReceiver = undefined;
    assert.equal(await receiver.close(), true);
  }
  console.log("Desktop activity ingress, concurrent synthetic hook commands, and renderer passed.");
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
  const [width, height] = dimensions[preferences.mode][preferences.windowSizes[preferences.mode]];
  const safe = fitBounds({ ...bounds, width, height }, area);
  if (safe.x !== bounds.x || safe.y !== bounds.y || safe.width !== bounds.width || safe.height !== bounds.height) {
    applyBounds(safe);
  }
}

function selectMonitor(display) {
  preferences.monitor = display?.id ?? null;
  if (display) {
    const { width, height } = window.getBounds();
    const area = display.workArea;
    applyBounds(fitBounds({ x: area.x + area.width - width - 20, y: area.y + 24, width, height }, area));
  }
  persist();
}

function setVisible(visible) {
  if (!window || window.isDestroyed()) return;
  preferences.hidden = !visible;
  if (visible) window.showInactive();
  else window.hide();
  updateHitTesting();
  persist();
}

function toggleVisible() { if (window.isVisible()) setVisible(false); else recover(); }

function hitTest() {
  if (!window?.isVisible()) return;
  let ignore = preferences.clickThrough;
  let inside = false;
  if (preferences.mode === "pet" || preferences.hoverInfo) {
    const bounds = window.getBounds();
    const cursor = screen.getCursorScreenPoint();
    const scale = petScales[preferences.petSize];
    const x = Math.abs(cursor.x - (bounds.x + bounds.width / 2));
    const y = Math.abs(cursor.y - (bounds.y + bounds.height / 2));
    inside = preferences.mode === "pet" ? x <= 40 * scale + (preferences.roaming ? 28 : 6) && y <= 32 * scale + 16
      : x <= bounds.width / 2 && y <= bounds.height / 2;
    if (preferences.mode === "pet") ignore ||= !inside;
  }
  if (mouseIgnored !== ignore) { mouseIgnored = ignore; window.setIgnoreMouseEvents(ignore); }
  if (hovered !== inside) { hovered = inside; paint(); }
}

function updateHitTesting() {
  clearInterval(hitTimer);
  hitTest();
  if (window.isVisible() && (preferences.mode === "pet" || preferences.hoverInfo)) hitTimer = setInterval(hitTest, 100);
}

function chooseShortcut(shortcut) {
  if (shortcut && !globalShortcut.isRegistered(shortcut) && !globalShortcut.register(shortcut, toggleVisible)) {
    dialog.showErrorBox("Pawmetry shortcut", "That shortcut is unavailable. Choose a different shortcut in the tray settings.");
    return;
  }
  if (preferences.shortcut && preferences.shortcut !== shortcut) globalShortcut.unregister(preferences.shortcut);
  preferences.shortcut = shortcut;
  persist();
}

function selectMode(mode) {
  preferences.mode = mode;
  resize(...dimensions[mode][preferences.windowSizes[mode]]);
  if (!smoke) updateHitTesting();
  paint();
}

const startupName = "Pawmetry";

async function chooseStartup(enable) {
  const { response } = await dialog.showMessageBox({ title: "Pawmetry Windows startup",
    message: enable ? "Start Pawmetry at Windows sign-in?" : "Remove Pawmetry from Windows startup?",
    detail: enable ? `Register this executable for your Windows account only.\n${process.execPath}`
      : "Remove the Pawmetry entry from startup for your Windows account.",
    buttons: ["Cancel", enable ? "Enable" : "Remove"], defaultId: 0, cancelId: 0 });
  if (response !== 1 || closing) return;
  app.setLoginItemSettings({ name: startupName, path: process.execPath, openAtLogin: enable, enabled: enable });
  const { launchItems } = app.getLoginItemSettings({ path: process.execPath });
  if (launchItems.some((item) => item.name === startupName && item.enabled) !== enable) {
    dialog.showErrorBox("Pawmetry startup", "The requested change could not be verified. Check Windows Startup Apps.");
  }
}

function selectSize(size) {
  preferences.windowSizes[preferences.mode] = size;
  resize(...dimensions[preferences.mode][size]);
}

function choice(label, values, current, format, select) {
  return { label, submenu: values.map((value) => ({ label: format(value), type: "radio", checked: current === value,
    click: () => { select(value); persist(); paint(); } })) };
}

function openSettings() {
  const title = (value) => value[0].toUpperCase() + value.slice(1);
  const alerts = { lowEnergy: "Low energy", lowStamina: "Low stamina", restoredEnergy: "Energy restored",
    restoredStamina: "Stamina restored", exhaustion: "Allowance at zero" };
  const toggle = (label, key) => ({ label, type: "checkbox", checked: preferences[key], click: (item) => {
    preferences[key] = item.checked;
    if (key === "hoverInfo") updateHitTesting();
    persist();
    paint();
  } });
  settingsMenu = Menu.buildFromTemplate([
    choice("Display mode", modes, preferences.mode, title, selectMode),
    choice("Window size", sizes, preferences.windowSizes[preferences.mode], title, selectSize),
    choice("Pet size", sizes, preferences.petSize, title, (value) => { preferences.petSize = value; }),
    choice("Background opacity", [0, 0.5, 0.8, 1], preferences.backgroundOpacity, (n) => `${n * 100}%`,
      (value) => { preferences.backgroundOpacity = value; }),
    choice("Pet opacity", [0.5, 0.75, 1], preferences.petOpacity, (n) => `${n * 100}%`, (value) => { preferences.petOpacity = value; }),
    choice("Animation speed", [0.5, 1, 1.5, 2], preferences.speed, (n) => `${n}×`, (value) => { preferences.speed = value; }),
    toggle("Energy bar", "energyBar"), toggle("Stamina bar", "staminaBar"), toggle("Information on hover", "hoverInfo"),
    toggle("Roam within the window", "roaming"), toggle("Reduced motion", "reducedMotion"),
    { label: "Always on top", type: "checkbox", checked: preferences.alwaysOnTop, click: (item) => {
      preferences.alwaysOnTop = item.checked;
      window.setAlwaysOnTop(item.checked);
      persist();
    } },
    { label: "Monitor", submenu: [
      { label: "Follow the pet", type: "radio", checked: preferences.monitor === null, click: () => selectMonitor(null) },
      ...screen.getAllDisplays().map((display, i) => ({ label: `Display ${i + 1}${display.label ? ` · ${display.label}` : ""}`,
        type: "radio", checked: preferences.monitor === display.id, click: () => selectMonitor(display) })),
    ] },
    choice("Global show/hide shortcut", [null, ...shortcuts], preferences.shortcut, (value) => value ?? "Off", chooseShortcut),
    ...(app.isPackaged && process.platform === "win32" ? [{ label: "Windows startup", submenu: [
      { label: "Enable at sign-in…", click: () => { void chooseStartup(true); } },
      { label: "Remove from startup…", click: () => { void chooseStartup(false); } },
    ] }] : []),
    { label: "Notifications", submenu: [
      ...alertKinds.map((kind) => choice(alerts[kind], ["off", "silent", "sound"], preferences.alerts[kind], title,
        (value) => { preferences.alerts[kind] = value; })),
      ...["energy", "stamina"].map((meter) => choice(`${title(meter)} threshold`, [10, 20, 30, 40, 50],
        preferences.lowThresholds[meter], (n) => `${n}%`, (value) => { preferences.lowThresholds[meter] = value; })),
      toggle("Quiet hours (10 pm to 7 am local time)", "quietHours"),
      { label: "Test notification", click: () => notify("Pawmetry test notification", Object.values(preferences.alerts).includes("sound"), true) },
    ] },
  ]);
  // A hidden presentation has no native menu owner. Show it so settings remain reachable.
  if (!window.isVisible()) recover();
  settingsMenu.popup({ window });
}

function persist() {
  clearTimeout(saveTimer);
  if (closing || !window || window.isDestroyed()) return;
  // A transient motion event can fire repeatedly while dragging.
  preferences.bounds = window.getBounds();
  saveTimer = setTimeout(() => savePreferences(preferencePath, preferences), 250);
}

function checkNotices() {
  const { status, observation } = live.view();
  const alerts = takeAlerts(status, observation, preferences);
  if (alerts.length) {
    notify(alerts.map(({ message }) => message).join(" · "), alerts.some(({ sound }) => sound));
  }
}

function notify(message, sound, test = false) {
  notice = { message, expires: Date.now() + 9000, test };
  if (Notification.isSupported()) new Notification({ title: "Pawmetry", body: message, silent: !sound }).show();
  paint();
}

async function start() {
  await app.whenReady();
  if (!smoke && process.platform === "win32") app.setAppUserModelId(process.execPath);
  const selected = screen.getAllDisplays().find((display) => display.id === preferences.monitor);
  const { workArea } = selected ?? screen.getPrimaryDisplay();
  const [width, height] = dimensions[preferences.mode][preferences.windowSizes[preferences.mode]];
  const wanted = { x: workArea.x + workArea.width - width - 20, y: workArea.y + 24, ...preferences.bounds, width, height };
  const initial = fitBounds(wanted, selected?.workArea ?? screen.getDisplayMatching(wanted).workArea);
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
  if (restoreSmoke) {
    assert.deepEqual(window.getBounds(), preferences.bounds, "saved bounds after restarting Electron");
    assert.deepEqual(window.getSize(), [...dimensions.dashboard.small]);
    assert.equal(preferences.petSize, "large");
    console.log("Desktop restarted with saved window bounds and independent pet size.");
    app.exit(0);
    return;
  }
  if (liveSmoke) {
    const passed = await smokeLive();
    console.log(passed ? "Desktop live quota, authenticated IPC, and renderer smoke passed." : "Desktop live smoke failed.");
    app.exit(passed ? 0 : 1);
    return;
  }
  if (smoke && !performanceSmoke) {
    window.showInactive();
    for (const mode of ["dashboard", "pet", "compact", "dashboard"]) {
      selectMode(mode);
      for (const size of ["large", "small", "standard", "large", "standard", "small"]) {
        selectSize(size);
        const [width, height] = dimensions[mode][size];
        assert.deepEqual(window.getSize(), [width, height], "native size after preset change");
        const resized = await window.webContents.executeJavaScript(`new Promise((resolve) => {
          const matches = () => innerWidth === ${width} && innerHeight === ${height} && document.body.dataset.layout === '${mode}';
          const until = performance.now() + 900;
          const check = () => matches() || performance.now() >= until ? resolve(matches()) : requestAnimationFrame(check);
          check();
        })`);
        assert.equal(resized, true, "renderer size after preset change");
      }
    }
    preferences.bounds = window.getBounds();
    savePreferences(preferencePath, preferences);
    assert.deepEqual(loadPreferences(preferencePath).bounds, preferences.bounds, "persisted compact bounds");
    assert.equal(loadPreferences(preferencePath).windowSizes.dashboard, "small");
    preferences.petSize = "large";
    paint();
    assert.equal(await window.webContents.executeJavaScript("getComputedStyle(document.querySelector('.placeholder')).width"), "96px");
    assert.deepEqual(window.getSize(), [...dimensions.dashboard.small]);
    savePreferences(preferencePath, preferences);
    console.log("Desktop bidirectional native sizing, renderer sizing, and saved bounds passed.");
    if (process.platform === "win32") await smokeActivity();
    paint();
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
  endpointTask = performanceSmoke ? Promise.resolve(null) : startEndpoint().catch(() => null);
  tray = new Tray(trayIcon());
  tray.setToolTip("Pawmetry");
  const menu = controlMenu = Menu.buildFromTemplate([
    { label: "Show or hide", click: toggleVisible },
    { label: "Live Codex quota", type: "checkbox", click: (item) => {
      liveSelected = item.checked;
      if (item.checked && !monitoringPaused) live.enable();
      else { live.disable(); notice = undefined; scenarioAt = Date.now(); }
      paint();
    } },
    { label: "Refresh live quota", click: () => live.refresh(true) },
    { label: "Start or stop disposable Codex activity", enabled: process.platform === "win32", click: toggleActivity },
    { id: "animation-pause", label: "Pause animations", type: "checkbox", click: (item) => pauseAnimation(item.checked) },
    { id: "monitoring-pause", label: "Pause monitoring", type: "checkbox", click: (item) => pauseMonitoring(item.checked) },
    { label: "Settings", click: openSettings },
    { label: "Next scenario", click: advance },
    { id: "click-through", label: "Click-through", type: "checkbox", checked: preferences.clickThrough, click: (item) => {
      preferences.clickThrough = item.checked;
      hitTest();
      persist();
    } },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  clickThroughItem = menu.getMenuItemById("click-through");
  tray.setContextMenu(menu);
  tray.on("double-click", recover);
  const petMenu = () => {
    menu.getMenuItemById("animation-pause").checked = paused;
    menu.getMenuItemById("monitoring-pause").checked = monitoringPaused;
    menu.popup({ window });
  };
  window.webContents.on("context-menu", petMenu);
  window.on("system-context-menu", (event) => { event.preventDefault(); petMenu(); });
  window.on("move", persist);
  window.on("resize", persist);
  screen.on("display-removed", keepOnDisplay);
  screen.on("display-metrics-changed", keepOnDisplay);
  powerMonitor.on("resume", () => { wakeAt = Date.now() + 2000; });
  if (preferences.shortcut) chooseShortcut(preferences.shortcut);
  if (!performanceSmoke && !preferences.hidden) window.showInactive();
  updateHitTesting();
  let lastScenario = Date.now();
  timer = setInterval(() => {
    if (wakeAt && Date.now() >= wakeAt && (!liveSelected || monitoringPaused || live.refresh(true))) wakeAt = 0;
    if (!wakeAt) live.refresh();
    checkNotices();
    if (!window.isVisible()) return;
    if (!paused && Date.now() - lastScenario >= 4500) {
      lastScenario = Date.now();
      advance();
    }
    paint();
  }, 1000);
  if (performanceSmoke) {
    await wait(2000);
    const samples = [];
    for (let index = 0; index < 5; index++) {
      await wait(1000);
      samples.push(app.getAppMetrics().reduce((total, item) => ({ cpu: total.cpu + item.cpu.percentCPUUsage,
        memoryMiB: total.memoryMiB + item.memory.workingSetSize / 1024 }), { cpu: 0, memoryMiB: 0 }));
    }
    console.log(JSON.stringify({ hiddenSimulation: true, samples }));
    app.quit();
  }
}

function recover() {
  if (!window || window.isDestroyed()) return;
  if (clickThroughItem) clickThroughItem.checked = false;
  preferences.clickThrough = mouseIgnored = false;
  window.setIgnoreMouseEvents(false);
  keepOnDisplay();
  setVisible(true);
  paint();
}

function resize(width, height) {
  const current = window.getBounds();
  const target = fitBounds({ ...current, width, height }, screen.getDisplayMatching(current).workArea);
  applyBounds(target);
  persist();
}

function applyBounds(target) {
  const { width, height } = window.getBounds();
  // Electron updates the maximum before the minimum for fixed-size windows.
  // Lower the old floor first so Windows can accept the smaller target.
  if (target.width < width || target.height < height) {
    window.setMinimumSize(Math.min(width, target.width), Math.min(height, target.height));
  }
  window.setBounds(target);
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
    const stoppingActivity = Promise.resolve(activityTask ?? activityReceiver).then((receiver) => receiver?.close());
    void Promise.allSettled([stopping, closingEndpoint, stoppingActivity]).then(() => app.quit());
  });
  app.on("will-quit", () => { clearInterval(timer); clearInterval(hitTimer); globalShortcut.unregisterAll(); tray?.destroy(); });
  start().catch((error) => {
    if (smoke) console.error(error);
    console.error("The Pawmetry simulation window could not start.");
    app.exit(1);
  });
} else {
  app.quit();
}
