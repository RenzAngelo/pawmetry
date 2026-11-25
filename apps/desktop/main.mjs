import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, powerMonitor, screen, Tray } from "electron";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { discoverCodex } from "../../tools/codex-quota-probe/discovery.ts";
import { isLocalSender, localWindow } from "./local-window.mjs";
import { createSettingsWindow, settingsUrl } from "./settings-window.mjs";
import { validSetting } from "./settings-model.ts";
import { enrollmentTargets } from "./activity-setup.ts";
import { openInCode, reviewCommand } from "./activity-client.ts";
import { createCompanionMenu, menuUrl } from "./menu-window.mjs";

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
let activityStopping;
let activityIssue = "";
let activityChecks = {};
let activityTransport = {};
let activityChecking = false;
let retainedActivityPaths = [];
let monitoringPaused = false;
let liveSelected = false;
let mouseIgnored = false;
let hovered = false;
let hitTimer;
let wakeAt = 0;
let controlMenu;
let viewport;
let viewportTimer;
let resizeGeneration = 0;
let codexInstall = { status: "unchecked" };
let codexExecutable;
let codexDetection;
let selectedProject = null;
const petScales = { small: 0.8, standard: 1, large: 1.2 };
const live = createLiveQuota();
const preferencePath = join(userData, "companion.json");
const preferences = loadPreferences(preferencePath);
const takeAlerts = quotaAlerts();
const petUrl = new URL("./index.html", import.meta.url).href;
const buildInfo = (() => {
  if (!app.isPackaged) return "Source checkout";
  try {
    const { version, revision, fingerprint } = JSON.parse(readFileSync(join(app.getAppPath(), "build-info.json"), "utf8"));
    return `${version} · ${revision} · ${fingerprint}`;
  } catch { return "Unlabeled portable build"; }
})();
const companionMenu = createCompanionMenu(() => paint());
const settings = createSettingsWindow({ saved: () => preferences.settingsBounds,
  move: (bounds) => { preferences.settingsBounds = bounds; persist(); }, closing: () => closing,
  fallback: () => (window?.isVisible() ? screen.getDisplayMatching(window.getBounds())
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())).workArea,
  visibility: applyAlwaysOnTop,
});

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

async function setActivity(enabled) {
  if (activityTask || activityStopping) return;
  if (!enabled && activityReceiver) {
    const receiver = activityReceiver;
    activityReceiver = undefined;
    activityStopping = receiver.close().catch(() => false);
    paint();
    const clean = await activityStopping;
    activityStopping = undefined;
    retainedActivityPaths = clean ? [] : Object.values(receiver.paths);
    activityIssue = clean ? "" : "A changed disposable hooks.json was left in place. Review and remove Pawmetry’s entries manually.";
    paint();
    return;
  }
  if (!enabled || activityReceiver || process.platform !== "win32" || closing) return;
  activityIssue = "";
  retainedActivityPaths = [];
  activityChecks = {};
  activityTransport = {};
  activityTask = prepareReceiver({ electron: true, onChange: paint, onError: () => {
    if (activityReceiver) void setActivity(false).then(() => {
      activityIssue = ["The local receiver stopped unexpectedly.", activityIssue].filter(Boolean).join(" ");
      paint();
    });
  } });
  paint();
  try {
    activityReceiver = await activityTask;
    activityReceiver.setPaused(monitoringPaused);
    activityChecks = { A: "present", B: "present" };
  } catch {
    activityIssue = "The disposable receiver could not start. Check Windows PowerShell policy and local application data access.";
  } finally {
    activityTask = undefined;
    paint();
  }
  if (activityReceiver && !closing) void checkActivitySetup();
}

async function checkActivitySetup() {
  const receiver = activityReceiver;
  if (!receiver || activityChecking) return;
  activityChecking = true;
  paint();
  try {
    const [checked, transport] = await Promise.all([receiver.checkConfigurations(), receiver.probe()]);
    if (receiver === activityReceiver) { activityChecks = checked; activityTransport = transport; }
  } catch {
    if (receiver === activityReceiver) activityIssue = "The local receiver check could not complete. Try Check files and receiver again.";
  } finally { activityChecking = false; paint(); }
}

function activityStatus(status) {
  const workspaces = activityReceiver?.diagnostics().map((row) => ({ ...row,
    configuration: activityChecks[row.label] ?? "unchecked", transport: activityTransport[row.label] ?? "unchecked" })) ?? [];
  const observed = workspaces.some(({ seen }) => seen);
  const expired = workspaces.some(({ last, states }) => last && states.length === 0);
  const state = activityStopping ? "stopping" : activityTask ? "starting" : monitoringPaused ? "paused" : !activityReceiver ? "unconfigured"
    : !observed ? "review" : status.activity === "unknown" ? (expired ? "stale" : "no-active-sessions") : status.activity;
  return { state, workspaces, issue: activityIssue, retainedPaths: retainedActivityPaths, available: process.platform === "win32",
    checking: activityChecking, hasReviewCommand: !!codexExecutable };
}

function settingsState() {
  const { status } = companionView();
  return { preferences, quota: status.quota, liveSelected, monitoringPaused, activity: activityStatus(status),
    codexInstall, targets: enrollmentTargets(app.getPath("home"), process.env.CODEX_HOME, selectedProject),
    buildInfo, executable: app.isPackaged ? process.execPath : null,
    displays: screen.getAllDisplays().map(({ id, label }, i) => ({ id, label: label || `Display ${i + 1}` })),
    canSetStartup: app.isPackaged && process.platform === "win32" };
}

async function detectCodexInstall() {
  if (codexDetection) return codexDetection;
  codexInstall = { status: "checking" };
  paint();
  codexDetection = discoverCodex().then((install) => {
    codexExecutable = install.status === "found" ? install.executable : undefined;
    codexInstall = install.status === "found" ? { status: "found", version: install.version } : { status: install.status };
  }).catch(() => { codexExecutable = undefined; codexInstall = { status: "missing" }; }).finally(() => { codexDetection = undefined; paint(); });
  return codexDetection;
}

function paint() {
  if (!window || window.isDestroyed()) return;
  const { status, pet } = companionView();
  if (settings.window?.isVisible() && !settings.window.isMinimized()) settings.window.webContents.send("pawmetry:settings-view", settingsState());
  const simulation = status.mode === "simulation";
  const now = Date.now();
  const sample = simulation && !monitoringPaused ? simulate(scenarios[scenario], scenarioAt) : null;
  const shown = sample && activityReceiver
    ? { ...sample.pet, pose: pet.pose } : sample?.pet ?? pet;
  const motion = animationStyle(shown, motionFor(shown.pose), paused || preferences.reducedMotion);
  const assumed = (slot) => sample?.quota?.windows.find((item) => item.slot === slot)?.resetsAtMs ?? null;
  window.webContents.send("pawmetry:view", {
    pet: shown, motion: { ...motion, width: motion.width * petScales[preferences.petSize],
      height: motion.height * petScales[preferences.petSize], durationMs: Math.round(motion.durationMs / preferences.speed) },
    mode: status.mode, quota: status.quota, activity: activityStatus(status).state, observing: !!activityReceiver,
    presentation: { mode: preferences.mode, background: preferences.backgroundOpacity, opacity: preferences.petOpacity,
      energy: preferences.energyBar, stamina: preferences.staminaBar, hover: preferences.hoverInfo, hovered, theme: preferences.theme,
      reducedMotion: preferences.reducedMotion,
      menuOpen: companionMenu.window?.isVisible() ?? false,
      roaming: preferences.roaming && !motion.frozen && shown.speed > 0 && ["walking", "running", "slow-walking"].includes(motion.motion),
      monitoringPaused, paused, alwaysOnTop: preferences.alwaysOnTop },
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
  const server = await listenStatus((op) => { command(op); return companionView().status; });
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
    setLiveQuota(true);
    const deadline = performance.now() + 18_000;
    while (performance.now() < deadline) {
      const snapshot = await askStatus(endpoint, "status");
      if (snapshot.quota === "fresh") {
        assert.equal(snapshot.activity, "unknown");
        assert.equal(activityStatus(snapshot).state, "unconfigured");
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

async function until(check, description, timeout = 3500) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    if (await check()) return;
    await wait(40);
  }
  assert.fail(description);
}

async function smokeControls(menu) {
  const press = (target, selector) => target.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const pet = (op) => press(window, `[data-command="${op}"]`);
  async function openOptions() {
    await pet("more");
    await until(() => companionMenu.window?.isVisible(), "custom options are visible");
    return companionMenu.window;
  }
  async function choose(op) {
    await press(await openOptions(), `[data-command="${op}"]`);
    await until(() => !companionMenu.window.isVisible(), "option closes the popup");
  }
  const options = await openOptions();
  const key = (name) => options.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(name)} }))`);
  await until(() => options.webContents.executeJavaScript("document.activeElement.dataset.command === 'mode-pet'"), "options focus its first item");
  assert.equal((await options.webContents.capturePage()).isEmpty(), false, "options rendered a frame");
  await key("ArrowDown");
  assert.equal(await options.webContents.executeJavaScript("document.activeElement.dataset.command"), "mode-compact");
  await key("End");
  assert.equal(await options.webContents.executeJavaScript("document.activeElement.dataset.command"), "quit");
  await key("Escape");
  await until(() => !options.isVisible(), "Escape closed the options and returned focus");
  await choose("toggle-animation");
  await until(() => paused && menu.getMenuItemById("animation-pause").checked, "window and tray agree on animation pause");
  await choose("toggle-animation");
  await until(() => !paused, "animation resumed");
  await pet("toggle-top");
  await until(() => !preferences.alwaysOnTop && !window.isAlwaysOnTop(), "always-on-top disabled");
  await pet("toggle-top");
  await until(() => preferences.alwaysOnTop && window.isAlwaysOnTop(), "always-on-top restored");
  await choose("mode-pet");
  await until(() => preferences.mode === "pet", "options changed display mode and native bounds");
  assert.deepEqual(window.getSize(), [...dimensions.pet[preferences.windowSizes.pet]]);
  const smallPopup = await openOptions();
  assert.deepEqual(fitBounds(smallPopup.getBounds(), screen.getDisplayMatching(smallPopup.getBounds()).workArea), smallPopup.getBounds());
  await press(smallPopup, '[data-command="mode-dashboard"]');
  await until(() => preferences.mode === "dashboard" && !smallPopup.isVisible(), "pet-only options restored dashboard");
  selectMode("dashboard");
  await pet("hide");
  await until(() => !window.isVisible(), "button hid the companion");
  setClickThrough(true);
  preferences.settingsBounds = { x: -99000, y: -99000, width: 680, height: 700 };
  menu.getMenuItemById("settings").click();
  await until(() => settings.window?.isVisible(), "tray Settings callback showed an independent window");
  const first = settings.window;
  const settingsId = first.id;
  const placed = first.getBounds();
  assert.deepEqual(fitBounds(placed, screen.getDisplayMatching(placed).workArea), placed);
  assert.equal(window.isVisible(), false, "Settings left the pet hidden");
  assert.equal(preferences.clickThrough, true, "Settings did not change click-through");
  await until(() => first.webContents.executeJavaScript("document.querySelector('#activity-state').textContent === 'Activity monitoring not configured'"), "Settings connected to its local preload");
  if (app.isPackaged) {
    const displayed = await first.webContents.executeJavaScript("document.querySelector('#build-info').textContent");
    assert.match(displayed, /\d+\.\d+\.\d+ · ([a-f0-9]{12}|unversioned) · [a-f0-9]{12}/, "About identifies the exact packaged app");
    console.log("Packaged build identity verified in About.");
  }
  assert.equal((await first.webContents.capturePage()).isEmpty(), false, "native Settings rendered a nonempty frame");
  first.setBounds({ ...placed, width: 370 });
  await until(() => first.webContents.executeJavaScript(`matchMedia('(max-width: 480px)').matches &&
    document.querySelector('nav').getBoundingClientRect().right <= innerWidth`), "narrow Settings navigation stays in the viewport");
  first.setBounds(placed);
  first.minimize();
  menu.getMenuItemById("settings").click();
  await until(() => first.isVisible() && !first.isMinimized(), "Settings restored from minimize");
  assert.equal(settings.window.id, settingsId);
  assert.equal(BrowserWindow.getAllWindows().filter((w) => w.getTitle() === "Pawmetry Settings").length, 1);
  await press(first, 'nav [data-section="connections"]');
  await press(first, '#open-wizard');
  await press(first, '[data-go="scope"]');
  await press(first, '[data-go="review"]');
  assert.match(await first.webContents.executeJavaScript("document.querySelector('#preview-path').textContent"), /hooks\.json$/i);
  assert.equal(activityReceiver, undefined, "wizard previews without starting enrollment");
  await press(first, 'nav [data-section="appearance"]');
  await first.webContents.executeJavaScript("history.replaceState(null, '', '#appearance')");
  await first.webContents.executeJavaScript(`{ const theme = document.querySelector('#setting-theme'); theme.value = '1';
    theme.dispatchEvent(new Event('change')); }`);
  await until(() => loadPreferences(preferencePath).theme === "light", "theme preference was saved");
  assert.equal(await first.webContents.executeJavaScript("document.documentElement.dataset.theme"), "light");
  await press(first, 'nav [data-section="behavior"]');
  await press(first, "#setting-reducedMotion");
  await until(() => loadPreferences(preferencePath).reducedMotion, "Settings changes persist to disk");
  assert.equal(await first.webContents.executeJavaScript("pawmetrySettings.update('settingsBounds', [])"), "Invalid setting.");
  await press(first, "#setting-reducedMotion");
  await until(() => !loadPreferences(preferencePath).reducedMotion, "Settings can revert a preference");
  command("show");
  assert.equal(window.isVisible(), true);
  assert.equal(preferences.clickThrough, false);
  first.hide();
  await pet("settings");
  await until(() => settings.window?.isVisible(), "pet Settings button opened the window");
  assert.equal(settings.window.id, settingsId);
  first.close();
  await until(() => !settings.window, "closing Settings destroys just its window");
  assert.equal(window.isAlwaysOnTop(), true);
  console.log("Desktop Settings, toolbar actions, off-screen recovery, and shared preference persistence passed.");
}

async function smokeActivity() {
  const panel = await openSettings();
  await panel.webContents.executeJavaScript(`document.querySelector('nav [data-section="advanced"]').click()`);
  await panel.webContents.executeJavaScript("document.querySelector('#start-activity').click()");
  await until(async () => activityReceiver && !activityTask && await panel.webContents.executeJavaScript(
    "document.querySelector('#diagnostic-state').textContent === 'Native approval not verified'"), "Settings created two disposable workspaces and is awaiting events");
  const receiver = activityReceiver;
  assert.deepEqual(await receiver.checkConfigurations(), { A: "present", B: "present" });
  await panel.webContents.executeJavaScript("document.querySelector('#check-hooks').click()");
  await until(() => activityTransport.A === "passed" && activityTransport.B === "passed", "Settings self-test reached both workspace keys");
  assert.equal(receiver.aggregate(), "unknown", "diagnostic probes cannot animate the pet");
  assert.equal(receiver.diagnostics().some(({ seen }) => seen), false);
  const configB = join(receiver.paths.B, ".codex", "hooks.json");
  const originalConfig = readFileSync(configB);
  try {
    writeFileSync(configB, "{}");
    assert.deepEqual(await receiver.probe(), { A: "passed", B: "invalid-configuration" });
  } finally { writeFileSync(configB, originalConfig); }
  async function deliver(folder, name) {
    const command = JSON.parse(readFileSync(join(folder, ".codex", "hooks.json"), "utf8")).hooks[name][0].hooks[0].command;
    const system = join(process.env.SystemRoot, "System32");
    const useCmd = folder === receiver.paths.A;
    const shell = useCmd ? join(system, "cmd.exe") : join(system, "WindowsPowerShell", "v1.0", "powershell.exe");
    const argv = useCmd ? ["/D", "/S", "/C", `"${command}"`] : ["-NoProfile", "-NonInteractive", "-Command", command];
    const child = spawn(shell, argv,
      { cwd: folder, windowsVerbatimArguments: useCmd, windowsHide: true, stdio: ["pipe", "ignore", "ignore"], timeout: 4200 });
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
    await until(() => panel.webContents.executeJavaScript(
      "document.querySelector('#diagnostic-state').textContent === 'Activity monitoring connected' && document.querySelectorAll('.workspace').length === 2"),
    "work in both disposable folders reached Settings while the pet was hidden");
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
    await deliver(receiver.paths.B, "PostModelRequest");
    assert.equal(activityStatus(companionView().status).state, "no-active-sessions");
    await deliver(receiver.paths.B, "SessionEnd");
    assert.equal(activityStatus(companionView().status).state, "disconnected");
    await panel.webContents.executeJavaScript("document.querySelector('#stop-activity').click()");
    await until(() => !activityReceiver && !activityStopping, "Settings stopped the receiver");
    assert.ok(Object.values(receiver.paths).every((folder) => !existsSync(join(folder, ".codex", "hooks.json"))));
  } finally {
    activityReceiver = undefined;
    assert.equal(await receiver.close(), true);
    assert.deepEqual(await receiver.probe(), { A: "receiver-unavailable", B: "receiver-unavailable" });
    panel.close();
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
  if (visible) { window.showInactive(); checkPetViewport(); }
  else { companionMenu.close(); window.hide(); }
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
    const petY = Math.abs(cursor.y - (bounds.y + (bounds.height - 25) / 2));
    const inToolbar = hovered && x <= 56 && cursor.y >= bounds.y + bounds.height - 34 && cursor.y < bounds.y + bounds.height;
    inside = preferences.mode === "pet" ? (x <= 40 * scale + (preferences.roaming ? 28 : 6) && petY <= 32 * scale + 12) || inToolbar
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
    return false;
  }
  if (preferences.shortcut && preferences.shortcut !== shortcut) globalShortcut.unregister(preferences.shortcut);
  preferences.shortcut = shortcut;
  persist();
  return true;
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

function applyAlwaysOnTop() {
  const visibleSettings = settings.window?.isVisible() && !settings.window.isMinimized();
  if (window && !window.isDestroyed()) window.setAlwaysOnTop(preferences.alwaysOnTop && !visibleSettings);
}

function setClickThrough(enabled) {
  preferences.clickThrough = enabled;
  if (clickThroughItem) clickThroughItem.checked = enabled;
  updateHitTesting();
  persist();
  paint();
}

function setLiveQuota(enabled) {
  liveSelected = enabled;
  if (controlMenu) controlMenu.getMenuItemById("live-quota").checked = enabled;
  if (enabled && !monitoringPaused) live.enable();
  else { void live.disable(); notice = undefined; scenarioAt = Date.now(); }
  paint();
}

async function openSettings() {
  try {
    const opened = await settings.open();
    if (opened && codexInstall.status === "unchecked") void detectCodexInstall();
    paint();
    return opened;
  }
  catch (error) {
    if (smoke) { console.error(error); return; }
    dialog.showErrorBox("Pawmetry Settings", "The Settings window could not open. Restart Pawmetry and try again.");
  }
}

function changeSetting(key, value) {
  if (!validSetting(key, value, screen.getAllDisplays().map(({ id }) => id))) return "Invalid setting.";
  if (key === "mode") selectMode(value);
  else if (key === "windowSize") selectSize(value);
  else if (key === "monitor") selectMonitor(screen.getAllDisplays().find(({ id }) => id === value));
  else if (key === "shortcut") { if (!chooseShortcut(value)) return "This shortcut is unavailable. The previous choice is still active."; }
  else if (key === "clickThrough") setClickThrough(value);
  else if (key === "energyThreshold" || key === "staminaThreshold") preferences.lowThresholds[key === "energyThreshold" ? "energy" : "stamina"] = value;
  else if (key.startsWith("alert-")) preferences.alerts[key.slice(6)] = value;
  else preferences[key] = value;
  if (key === "alwaysOnTop") applyAlwaysOnTop();
  if (key === "hoverInfo" || key === "roaming" || key === "petSize") updateHitTesting();
  persist();
  paint();
  return savePreferences(preferencePath, preferences) ? "" : "Changed for this run. Pawmetry could not save the preference to disk.";
}

function command(op) {
  switch (op) {
    case "refresh": live.refresh(true); break;
    case "show": recover(); break;
    case "hide": setVisible(false); break;
    case "pause-monitoring": case "resume-monitoring": pauseMonitoring(op === "pause-monitoring"); break;
    case "pause-animation": case "resume-animation": pauseAnimation(op === "pause-animation"); break;
    case "settings": void openSettings(); break;
    case "quit": setTimeout(() => app.quit(), 150); break;
    case "toggle-top": changeSetting("alwaysOnTop", !preferences.alwaysOnTop); break;
    case "toggle-animation": pauseAnimation(!paused); break;
    case "toggle-monitoring": pauseMonitoring(!monitoringPaused); break;
    case "toggle-click": setClickThrough(!preferences.clickThrough); break;
    case "mode-pet": case "mode-compact": case "mode-dashboard": changeSetting("mode", op.slice(5)); break;
    case "more": if (window?.isVisible()) void companionMenu.open(window, () => ({ theme: preferences.theme,
      mode: preferences.mode, paused, monitoringPaused, clickThrough: preferences.clickThrough, reducedMotion: preferences.reducedMotion,
      refreshEnabled: liveSelected && !monitoringPaused })).catch(() => {}); break;
  }
}

function connectRendererIpc() {
  const fromSettings = (event) => isLocalSender(event, settings.window, settingsUrl);
  ipcMain.handle("pawmetry:control", (event, op) => {
    if (isLocalSender(event, window, petUrl) && ["settings", "hide", "toggle-top", "more"].includes(op)) command(op);
  });
  ipcMain.on("pawmetry:viewport", (event, width, height) => {
    if (isLocalSender(event, window, petUrl) && [width, height].every((size) => Number.isInteger(size) && size > 0 && size <= 4096)) {
      viewport = { width, height };
    }
  });
  ipcMain.handle("pawmetry:menu-command", (event, op) => {
    if (!isLocalSender(event, companionMenu.window, menuUrl) || !companionMenu.window.isVisible()
      || !["close", "mode-pet", "mode-compact", "mode-dashboard", "toggle-animation", "toggle-monitoring", "toggle-click", "refresh", "settings", "quit"].includes(op)) return;
    companionMenu.close();
    if (op === "close" && window.isVisible()) { window.focus(); window.webContents.send("pawmetry:focus-options"); }
    else command(op);
  });
  ipcMain.handle("pawmetry:settings-read", (event) => fromSettings(event) ? settingsState() : null);
  ipcMain.handle("pawmetry:settings-update", (event, key, value) => fromSettings(event) ? changeSetting(key, value) : "Settings command denied.");
  ipcMain.handle("pawmetry:settings-action", async (event, action) => {
    if (!fromSettings(event)) return null;
    switch (action) {
      case "detect-codex": await detectCodexInstall(); break;
      case "select-project": {
        const result = await dialog.showOpenDialog(settings.window, { properties: ["openDirectory"], title: "Choose a project to preview" });
        if (!result.canceled) selectedProject = result.filePaths[0] ?? null;
        break;
      }
      case "start-activity": case "stop-activity": await setActivity(action === "start-activity"); break;
      case "check-hooks": await checkActivitySetup(); break;
      case "copy-A": case "copy-B": if (activityReceiver) clipboard.writeText(activityReceiver.paths[action === "copy-A" ? "A" : "B"]); break;
      case "open-A": case "open-B": {
        const receiver = activityReceiver;
        if (receiver && !await openInCode(receiver.paths[action === "open-A" ? "A" : "B"])) {
          activityIssue = "VS Code could not be opened automatically. Copy the workspace path and use VS Code → File → Open Folder.";
        }
        break;
      }
      case "review-A": case "review-B": {
        const receiver = activityReceiver;
        if (receiver && codexExecutable) clipboard.writeText(reviewCommand(codexExecutable, receiver.paths[action === "review-A" ? "A" : "B"]));
        break;
      }
      case "live-quota": case "simulate-quota": setLiveQuota(action === "live-quota"); break;
      case "pause-monitoring": case "resume-monitoring": case "refresh": command(action); break;
      case "next-scenario": advance(); break;
      case "test-notice": notify("Pawmetry test notification", Object.values(preferences.alerts).includes("sound"), true); break;
      case "start-at-login": case "remove-at-login": if (app.isPackaged && process.platform === "win32") await chooseStartup(action === "start-at-login"); break;
      default: return null;
    }
    paint();
    return settingsState();
  });
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
  window = newPetWindow(initial);
  connectRendererIpc();
  const menu = buildControlMenu();
  await window.loadFile(local("index.html"));
  paint();
  if (restoreSmoke) {
    assert.deepEqual(window.getBounds(), preferences.bounds, "saved bounds after restarting Electron");
    assert.deepEqual(window.getSize(), [...dimensions.dashboard.small]);
    assert.equal(preferences.petSize, "large");
    assert.equal(preferences.theme, "light");
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
        await until(async () => {
          try { return await window.webContents.executeJavaScript(`innerWidth === ${width} && innerHeight === ${height} && document.body.dataset.layout === '${mode}'`); }
          catch { return false; }
        }, "renderer size and layout after preset change", 4500);
        assert.equal(await window.webContents.executeJavaScript(`
          [...document.querySelectorAll('.commands button')].every(button => {
            const box = button.getBoundingClientRect();
            return box.width > 0 && box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
              && button.title && getComputedStyle(button.querySelector('.icon')).maskImage !== 'none';
          })`), true, "all four labeled controls fit the visible viewport");
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
    const original = window;
    await until(() => viewport?.width === window.getContentBounds().width, "the renderer reported its viewport");
    viewport = { width: 1, height: 1 };
    checkPetViewport();
    await until(() => original.isDestroyed() && window.isVisible() && viewport?.width === window.getContentBounds().width,
      "the companion replaced a stale renderer and retained its accepted bounds");
    assert.deepEqual(window.getSize(), [...dimensions.dashboard.small]);
    console.log("Desktop restored a stale renderer without resetting desktop state.");
    await smokeControls(menu);
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
  tray.setContextMenu(menu);
  tray.on("double-click", recover);
  for (const event of ["display-removed", "display-metrics-changed"]) screen.on(event, () => { companionMenu.close(); keepOnDisplay(); settings.recover(); paint(); });
  powerMonitor.on("resume", () => { wakeAt = Date.now() + 2000; });
  if (preferences.shortcut && !chooseShortcut(preferences.shortcut)) preferences.shortcut = null;
  if (!performanceSmoke && !preferences.hidden) window.showInactive();
  updateHitTesting();
  let lastScenario = Date.now();
  timer = setInterval(() => {
    if (wakeAt && Date.now() >= wakeAt && (!liveSelected || monitoringPaused || live.refresh(true))) wakeAt = 0;
    if (!wakeAt) live.refresh();
    checkNotices();
    if (!window.isVisible()) { if (settings.window?.isVisible()) paint(); return; }
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

function buildControlMenu() {
  controlMenu = Menu.buildFromTemplate([
    { label: "Show or hide pet", click: toggleVisible },
    { id: "settings", label: "Settings", click: () => command("settings") },
    { id: "live-quota", label: "Live Codex quota", type: "checkbox", click: (item) => setLiveQuota(item.checked) },
    { label: "Refresh live quota", click: () => command("refresh") },
    { label: "Display mode", submenu: modes.map((value) => ({ label: value === "pet" ? "Pet only" : value === "compact" ? "Compact" : "Dashboard",
      click: () => changeSetting("mode", value) })) },
    { id: "animation-pause", label: "Pause animations", type: "checkbox", click: (item) => pauseAnimation(item.checked) },
    { id: "monitoring-pause", label: "Pause monitoring", type: "checkbox", click: (item) => pauseMonitoring(item.checked) },
    { label: "Next scenario", click: advance },
    { id: "click-through", label: "Click-through", type: "checkbox", checked: preferences.clickThrough, click: (item) => setClickThrough(item.checked) },
    { type: "separator" },
    { label: "Exit Pawmetry", click: () => command("quit") },
  ]);
  clickThroughItem = controlMenu.getMenuItemById("click-through");
  return controlMenu;
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
  if (width !== target.width || height !== target.height) checkPetViewport();
}

function newPetWindow(bounds) {
  const pet = localWindow({ ...bounds, transparent: true, frame: false, alwaysOnTop: preferences.alwaysOnTop,
    skipTaskbar: true, resizable: false, show: false }, local("preload.cjs"), !smoke);
  pet.webContents.on("context-menu", () => command("more"));
  pet.on("system-context-menu", (event) => { event.preventDefault(); command("more"); });
  const recordBounds = () => { if (window === pet) persist(); };
  pet.on("move", recordBounds);
  pet.on("resize", recordBounds);
  return pet;
}

function checkPetViewport() {
  clearTimeout(viewportTimer);
  const generation = ++resizeGeneration;
  const original = window;
  if (!original?.isVisible()) return;
  viewportTimer = setTimeout(async () => {
    if (closing || original.isDestroyed() || !original.isVisible()) return;
    const { width, height } = original.getContentBounds();
    if (viewport && Math.abs(viewport.width - width) <= 1 && Math.abs(viewport.height - height) <= 1) return;
    // Windows may resize the native transparent window without updating its Chromium viewport.
    // Reopen only the pet at its already accepted bounds and keep the receiver and settings alive.
    const replacement = newPetWindow(original.getBounds());
    try {
      await replacement.loadFile(local("index.html"));
      if (closing || generation !== resizeGeneration || window !== original || original.isDestroyed() || !original.isVisible()) return;
      const final = original.getBounds();
      replacement.setPosition(final.x, final.y);
      companionMenu.close();
      window = replacement;
      viewport = undefined;
      mouseIgnored = false;
      applyAlwaysOnTop();
      replacement.showInactive();
      updateHitTesting();
      replacement.webContents.send("pawmetry:request-viewport");
      paint();
      original.destroy();
    } catch { /* Keep the old window if the replacement could not load. */ }
    finally { if (window !== replacement && !replacement.isDestroyed()) replacement.destroy(); }
  }, 1250);
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
    void Promise.allSettled([stopping, closingEndpoint, stoppingActivity, activityStopping]).then(() => app.quit());
  });
  app.on("will-quit", () => { clearInterval(timer); clearInterval(hitTimer); clearTimeout(viewportTimer); globalShortcut.unregisterAll(); tray?.destroy(); });
  start().catch((error) => {
    if (smoke) console.error(error);
    console.error("The Pawmetry simulation window could not start.");
    app.exit(1);
  });
} else {
  app.quit();
}
