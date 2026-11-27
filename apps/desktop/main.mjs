import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, powerMonitor, screen, Tray } from "electron";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
import { spriteFrame } from "../../packages/animation/sprite-atlas.ts";
import { loadCatAtlas } from "./mascot.mjs";
import { catDimensions, dimensions as fallbackDimensions, fitBounds, loadPreferences, modes, placeCompanionMenu, savePreferences, shortcuts, sizes } from "./preferences.ts";
import { discoverCodex } from "../../tools/codex-quota-probe/discovery.ts";
import { isLocalSender, localWindow, setPinned } from "./local-window.mjs";
import { createSettingsWindow, settingsUrl } from "./settings-window.mjs";
import { validSetting } from "./settings-model.ts";
import { createCompanionMenu, menuUrl } from "./menu-window.mjs";

if (app.isPackaged) {
  app.commandLine.removeSwitch("remote-debugging-port");
  app.commandLine.removeSwitch("remote-debugging-pipe");
}

const liveSmoke = process.argv.includes("--smoke-live");
const visiblePerformance = process.argv.includes("--smoke-performance-visible");
const performanceSmoke = visiblePerformance || process.argv.includes("--smoke-performance");
const restoreSmoke = process.argv.includes("--smoke-restored-layout");
const layoutSmoke = process.argv.includes("--smoke-test");
const smoke = liveSmoke || performanceSmoke || restoreSmoke || layoutSmoke;
const lockSmoke = process.argv.includes("--smoke-lock");
const local = (file) => fileURLToPath(new URL(file, import.meta.url));
let packagedInfo;
if (app.isPackaged) {
  try { packagedInfo = JSON.parse(readFileSync(join(app.getAppPath(), "build-info.json"), "utf8")); }
  catch { /* an unlabeled package can still use the fallback */ }
}
const bundledQuota = !smoke && !!packagedInfo?.bundledCompanion;
const cat = loadCatAtlas(new URL("../../assets/mascots/cat/", import.meta.url), (image) => nativeImage.createFromBuffer(image).getSize());
const dimensions = cat ? catDimensions : fallbackDimensions;
const catProfile = cat && Object.fromEntries(Object.entries(cat.clips).map(([name, clip]) => [name, { ...clip, width: 80, height: 64 }]));
const cache = local("../../.cache/");
if (lockSmoke || smoke) mkdirSync(cache, { recursive: true });
const testId = process.env.PAWMETRY_LOCK_TEST_ID;
if (lockSmoke && (!testId || !/^[a-f0-9]{32}$/.test(testId))) throw new Error("Expected an isolated lock test ID");
const restoreProfile = process.env.PAWMETRY_RESTORE_PROFILE ?? "";
const sharedSmoke = (restoreSmoke || layoutSmoke) && /^desktop-restore-[A-Za-z0-9]{6}$/.test(restoreProfile);
if (restoreSmoke && !sharedSmoke) throw new Error("Expected an isolated restore test profile");
const userData = lockSmoke ? join(cache, "desktop-lock-" + testId)
  : sharedSmoke ? join(cache, restoreProfile)
  : smoke ? mkdtempSync(join(cache, "desktop-smoke-"))
  : join(app.getPath("appData"), packagedInfo?.catReview || (!packagedInfo && cat) ? "Pawmetry Cat Review" : "Pawmetry");
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
let monitoringPaused = false;
let liveSelected = false;
let mouseIgnored = false;
let petDrag;
let hovered = false;
let hitTimer;
let wakeAt = 0;
let controlMenu;
let viewport;
let viewportTimer;
let resizeGeneration = 0;
let codexInstall = { status: "unchecked" };
let codexDetection;
const petScales = { small: 0.8, standard: 1, large: 1.2 };
const live = createLiveQuota();
const preferencePath = join(userData, "companion.json");
const preferences = loadPreferences(preferencePath);
const petUrl = new URL("./index.html", import.meta.url).href;
const buildInfo = packagedInfo ? `${packagedInfo.version} · ${packagedInfo.revision} · ${packagedInfo.fingerprint}`
  : app.isPackaged ? "Unlabeled portable build" : "Source checkout";
const companionMenu = createCompanionMenu(() => paint());
const settings = createSettingsWindow({ saved: () => preferences.settingsBounds,
  move: (bounds) => { preferences.settingsBounds = bounds; persist(); }, closing: () => closing,
  fallback: () => (window?.isVisible() ? screen.getDisplayMatching(window.getBounds())
    : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())).workArea,
  visibility: applyAlwaysOnTop,
});

function companionView() {
  const view = live.view();
  if ((monitoringPaused && liveSelected) || (bundledQuota && !liveSelected)) {
    view.status = { ...view.status, mode: "live", quota: "paused" };
  }
  return view;
}

function pauseMonitoring(value) {
  monitoringPaused = value;
  if (controlMenu) controlMenu.getMenuItemById("monitoring-pause").checked = value;
  if (monitoringPaused) void live.disable();
  else if (liveSelected) live.enable();
  paint();
}

function pauseAnimation(value) {
  paused = value;
  if (controlMenu) controlMenu.getMenuItemById("animation-pause").checked = value;
  paint();
}

function settingsState() {
  const { status } = companionView();
  return { preferences, quota: status.quota, liveSelected, monitoringPaused, codexInstall, bundledQuota,
    buildInfo, cat: !!cat, executable: app.isPackaged ? process.execPath : null,
    displays: screen.getAllDisplays().map(({ id, label }, i) => ({ id, label: label || `Display ${i + 1}` })) };
}

async function detectCodexInstall() {
  if (codexDetection) return codexDetection;
  codexInstall = { status: "checking" };
  paint();
  codexDetection = discoverCodex().then((install) => {
    codexInstall = install.status === "found" ? { status: "found", version: install.version } : { status: install.status };
  }).catch(() => { codexInstall = { status: "missing" }; }).finally(() => { codexDetection = undefined; paint(); });
  return codexDetection;
}

function paint() {
  if (!window || window.isDestroyed()) return;
  const { status, pet } = companionView();
  if (settings.window?.isVisible() && !settings.window.isMinimized()) settings.window.webContents.send("pawmetry:settings-view", settingsState());
  const simulation = status.mode === "simulation";
  const now = Date.now();
  const sample = simulation && !monitoringPaused ? simulate(scenarios[scenario], scenarioAt) : null;
  const shown = sample?.pet ?? pet;
  const motion = animationStyle(shown, motionFor(shown.pose), paused || preferences.reducedMotion, catProfile || undefined);
  const assumed = (slot) => sample?.quota?.windows.find((item) => item.slot === slot)?.resetsAtMs ?? null;
  window.webContents.send("pawmetry:view", {
    pet: shown, motion: { ...motion, width: motion.width * petScales[preferences.petSize],
      height: motion.height * petScales[preferences.petSize], durationMs: Math.round(motion.durationMs / preferences.speed) },
    sprite: cat ? { size: preferences.mascotSize, row: spriteFrame(cat, motion.motion, "right", 0).y / cat.frameHeight,
      idle: { row: 0, frames: cat.clips.idle.frames, durationMs: 1000 * cat.clips.idle.frames / cat.clips.idle.fps / preferences.speed } } : null,
    mode: status.mode, quota: status.quota,
    presentation: { mode: preferences.mode, background: preferences.backgroundOpacity, opacity: preferences.petOpacity,
      energy: preferences.energyBar, stamina: preferences.staminaBar, hover: preferences.hoverInfo, hovered, theme: preferences.theme,
      reducedMotion: preferences.reducedMotion,
      menuOpen: companionMenu.window?.isVisible() ?? false,
      roaming: preferences.roaming && !motion.frozen && shown.speed > 0 && ["walking", "running", "slow-walking"].includes(motion.motion),
      monitoringPaused, quotaOff: bundledQuota && !liveSelected, paused, alwaysOnTop: window.isAlwaysOnTop() },
    resets: {
      energy: resetText(simulation ? assumed("energy") : status.energy.resetAt, now),
      stamina: resetText(simulation ? assumed("stamina") : status.stamina.resetAt, now),
    },
  });
}

function advance() {
  if (bundledQuota || live.view().status.mode !== "simulation") return;
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
    command(op);
    const status = companionView().status;
    return op === "identify" && packagedInfo?.bundledCompanion
      ? { ...status, build: { version: packagedInfo.version, fingerprint: packagedInfo.fingerprint } } : status;
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
    setLiveQuota(true);
    const deadline = performance.now() + 18_000;
    while (performance.now() < deadline) {
      const snapshot = await askStatus(endpoint, "status");
      if (snapshot.quota === "fresh") {
        assert.equal(Object.hasOwn(snapshot, "activity"), false);
        paint();
        await wait(120);
        return window.webContents.executeJavaScript(
          "document.querySelector('#mode').textContent === 'Live Codex' && "
          + "document.querySelector('#pose').textContent.endsWith(' · Quota only') && "
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
  assert.equal(await window.webContents.executeJavaScript(`(() => {
    const region = (selector) => getComputedStyle(document.querySelector(selector)).getPropertyValue('app-region');
    const bar = document.querySelector('.drag-bar').getBoundingClientRect();
    const toolbar = document.querySelector('.commands').getBoundingClientRect();
    return region('.drag-bar') !== 'drag' && bar.width >= toolbar.width && bar.bottom <= toolbar.top
      && region('.card') !== 'drag' && region('.stage') !== 'drag'
      && [...document.querySelectorAll('.commands button')].every((button) => getComputedStyle(button).getPropertyValue('app-region') === 'no-drag');
  })()`), true, "the floating toolbar is outside the window drag regions");
  if (process.platform === "win32") {
    const before = window.getBounds();
    const area = screen.getDisplayMatching(before).workArea;
    const x = before.x + 40, y = before.y + 26;
    const dx = before.x > area.x + 40 ? -40 : 40;
    await window.webContents.executeJavaScript(`{
      pawmetry.drag('start', ${x}, ${y});
      pawmetry.drag('move', ${x + dx}, ${y});
      pawmetry.drag('end');
    }`);
    await until(() => window.getBounds().x === before.x + dx, "the bounded drag channel repositions the Windows companion");
    window.setPosition(before.x, before.y);
  }
  async function openOptions() {
    const pinned = window.isAlwaysOnTop();
    await pet("more");
    await until(() => companionMenu.window?.isVisible(), "custom options are visible");
    assert.equal(window.isAlwaysOnTop(), pinned, "opening options preserves the pet's native topmost state");
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
  await until(() => loadPreferences(preferencePath).alwaysOnTop === false, "pin-off preference was saved");
  await pet("toggle-top");
  await until(() => preferences.alwaysOnTop && window.isAlwaysOnTop(), "always-on-top restored");
  await choose("mode-pet");
  await until(() => preferences.mode === "pet", "options changed display mode and native bounds");
  assert.deepEqual(window.getSize(), [...dimensions.pet[preferences.windowSizes.pet]]);
  if (cat) {
    const savedSize = preferences.mascotSize;
    const savedWindowSize = preferences.windowSizes.pet;
    selectSize("standard");
    changeSetting("mascotSize", 64);
    clearInterval(hitTimer);
    window.focus();
    const bounds = window.getContentBounds();
    await until(() => window.webContents.executeJavaScript(`innerWidth === ${bounds.width} && innerHeight === ${bounds.height}
      && document.body.dataset.layout === 'pet'`), "pet-only viewport is ready for pointer testing");
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + (bounds.height - 25) / 2 };
    hitTest(center);
    assert.ok(hovered && !mouseIgnored, "hovering over Cat enables the toolbar");
    hitTest({ ...center, y: center.y + 40 });
    assert.ok(hovered && !mouseIgnored, "crossing the gap from Cat to the floating buttons keeps them clickable");
    for (const pinned of [false, true]) {
      clearInterval(hitTimer);
      hitTest(center);
      const button = await window.webContents.executeJavaScript(`(() => {
        const { x, y, width, height } = document.querySelector('[data-command="toggle-top"]').getBoundingClientRect();
        return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
      })()`);
      hitTest({ x: bounds.x + button.x, y: bounds.y + button.y });
      assert.ok(!mouseIgnored, "the pin accepts pointer input");
      const coordinates = { ...button, button: "left", clickCount: 1 };
      window.webContents.sendInputEvent({ type: "mouseDown", ...coordinates });
      window.webContents.sendInputEvent({ type: "mouseUp", ...coordinates });
      await until(() => window.isAlwaysOnTop() === pinned, "the floating pin toggles in pet-only mode");
    }
    hitTest({ x: bounds.x + 5, y: bounds.y + bounds.height - 8 });
    assert.ok(!hovered && mouseIgnored, "outside Cat and its controls clicks pass through");
    selectSize(savedWindowSize);
    changeSetting("mascotSize", savedSize);
    hitTest(center);
  }
  const smallPopup = await openOptions();
  const anchor = window.getBounds();
  assert.deepEqual(smallPopup.getBounds(), placeCompanionMenu(anchor, screen.getDisplayMatching(anchor).workArea));
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
  await until(() => first.isFocused() && first.isAlwaysOnTop(), "focused Settings is interactive above a pinned pet");
  const settingsId = first.id;
  const placed = first.getBounds();
  assert.deepEqual(fitBounds(placed, screen.getDisplayMatching(placed).workArea), placed);
  assert.equal(window.isVisible(), false, "Settings left the pet hidden");
  assert.equal(preferences.clickThrough, true, "Settings did not change click-through");
  await until(() => first.webContents.executeJavaScript("document.querySelector('#quota-state').textContent === 'Simulation quota'"), "Settings connected to its local preload");
  assert.equal(await first.webContents.executeJavaScript(
    "pawmetrySettings.action(['start', 'activity'].join('-'))"), null, "former experimental action is unreachable");
  assert.equal(await first.webContents.executeJavaScript(
    "document.querySelector('[data-action=refresh]').disabled"), true, "refresh is disabled during simulation");
  assert.equal(await first.webContents.executeJavaScript(
    "document.querySelector('#toggle-quota').textContent"), "Connect to Codex quota");
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
  await press(first, 'nav [data-section="appearance"]');
  await first.webContents.executeJavaScript("history.replaceState(null, '', '#appearance')");
  if (cat) {
    await first.webContents.executeJavaScript(`{
      const preset = document.querySelector('#setting-mascot-preset');
      preset.value = '1'; preset.dispatchEvent(new Event('change'));
    }`);
    await until(() => preferences.mascotSize === 96, "Cat size preset updated the shared preference");
    await first.webContents.executeJavaScript(`{
      const slider = document.querySelector('#setting-mascotSize');
      slider.value = String(143 - 64); slider.dispatchEvent(new Event('change'));
    }`);
    await until(() => loadPreferences(preferencePath).mascotSize === 143, "custom Cat size persisted");
  }
  for (const [index, theme] of ["dark", "light", "system"].entries()) {
    await first.webContents.executeJavaScript(`{ const input = document.querySelector('#setting-theme'); input.value = '${index}';
      input.dispatchEvent(new Event('change')); }`);
    await until(async () => await first.webContents.executeJavaScript("document.documentElement.dataset.theme") === theme,
      "native Settings applied " + theme + " theme");
  }
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
  assert.equal(window.isAlwaysOnTop(), true, "restoring the pinned pet while Settings is open preserves native topmost state");
  await until(() => window.webContents.executeJavaScript(`document.querySelector('[data-command="toggle-top"]').getAttribute('aria-pressed') === 'true'`),
    "the toolbar pin reflects native topmost state");
  await first.webContents.executeJavaScript("pawmetrySettings.update('alwaysOnTop', false)");
  assert.equal(window.isAlwaysOnTop(), false, "Settings can unpin the pet while both windows are visible");
  assert.equal(first.isAlwaysOnTop(), false);
  await first.webContents.executeJavaScript("pawmetrySettings.update('alwaysOnTop', true)");
  assert.equal(window.isAlwaysOnTop(), true, "Settings can re-pin the pet while both windows are visible");
  window.focus();
  await until(() => !first.isFocused() && !first.isAlwaysOnTop(), "Settings releases topmost state when it loses focus");
  assert.equal(window.isAlwaysOnTop(), true);
  first.minimize();
  await until(() => first.isMinimized() && !first.isAlwaysOnTop(), "minimizing Settings releases its own topmost state");
  assert.equal(window.isAlwaysOnTop(), true);
  await openSettings();
  first.hide();
  await pet("settings");
  await until(() => settings.window?.isVisible(), "pet Settings button opened the window");
  assert.equal(settings.window.id, settingsId);
  first.close();
  await until(() => !settings.window, "closing Settings destroys just its window");
  assert.equal(window.isAlwaysOnTop(), true);
  console.log("Desktop Settings, toolbar actions, off-screen recovery, and shared preference persistence passed.");
}

function trayIcon() {
  const variant = nativeTheme.shouldUseDarkColors ? "dark" : "light";
  return nativeImage.createFromPath(local(`../../assets/branding/pawmetry/tray-${variant}.png`));
}

function updateTrayIcon() { if (tray && !tray.isDestroyed()) tray.setImage(trayIcon()); }

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
  if (visible) { showPet(); checkPetViewport(); }
  else { companionMenu.close(); window.hide(); }
  updateHitTesting();
  persist();
}

function toggleVisible() { if (window.isVisible()) setVisible(false); else recover(); }

function hitTest(cursor = screen.getCursorScreenPoint()) {
  if (!window?.isVisible()) return;
  let ignore = preferences.clickThrough;
  let inside = false;
  if (preferences.mode === "pet" || preferences.hoverInfo) {
    const bounds = window.getBounds();
    const scale = petScales[preferences.petSize];
    const x = Math.abs(cursor.x - (bounds.x + bounds.width / 2));
    const y = Math.abs(cursor.y - (bounds.y + bounds.height / 2));
    const petY = Math.abs(cursor.y - (bounds.y + (bounds.height - 25) / 2));
    // Keep the toolbar reachable across the transparent space below the mascot.
    const inToolbarPath = hovered && x <= 56 && cursor.y >= bounds.y + (bounds.height - 25) / 2
      && cursor.y < bounds.y + bounds.height;
    const stride = preferences.roaming ? Math.min(22, bounds.width / 10) : 0;
    const catHalf = Math.min(preferences.mascotSize, bounds.height - 25, bounds.width - 2 * stride) / 2;
    inside = preferences.mode === "pet" ? (cat
      ? x <= catHalf + stride && petY <= catHalf
      : x <= 40 * scale + (preferences.roaming ? 28 : 6) && petY <= 32 * scale + 12) || inToolbarPath
      : x <= bounds.width / 2 && y <= bounds.height / 2;
    if (preferences.mode === "pet") {
      inside ||= !!petDrag;
      ignore ||= !inside;
    }
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

function selectSize(size) {
  preferences.windowSizes[preferences.mode] = size;
  resize(...dimensions[preferences.mode][size]);
}

function applyAlwaysOnTop() {
  const pinned = preferences.alwaysOnTop;
  if (window && !window.isDestroyed() && window.isAlwaysOnTop() !== pinned) setPinned(window, pinned);
  const panel = settings.window;
  if (!panel || panel.isDestroyed()) return;
  // Let focused Settings sit above an overlapping pinned pet, then release it on blur.
  const bringAbovePet = pinned && panel.isVisible() && !panel.isMinimized() && panel.isFocused();
  if (panel.isAlwaysOnTop() !== bringAbovePet) setPinned(panel, bringAbovePet);
}

function showPet() {
  window.showInactive();
  applyAlwaysOnTop();
  // Showing or replacing the pet must preserve the stacking of focused Settings.
  if (settings.window?.isAlwaysOnTop()) settings.window.moveTop();
}

function setClickThrough(enabled) {
  if (enabled) petDrag = undefined;
  preferences.clickThrough = enabled;
  if (clickThroughItem) clickThroughItem.checked = enabled;
  updateHitTesting();
  persist();
  paint();
}

function setLiveQuota(enabled, remember = true) {
  liveSelected = enabled;
  if (bundledQuota && remember) {
    preferences.liveQuotaDisabled = !enabled;
    persist();
  }
  const liveItem = controlMenu?.getMenuItemById("live-quota");
  if (liveItem) liveItem.checked = enabled;
  if (enabled && !monitoringPaused) live.enable();
  else { void live.disable(); scenarioAt = Date.now(); }
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
  else preferences[key] = value;
  if (key === "alwaysOnTop") applyAlwaysOnTop();
  if (key === "hoverInfo" || key === "roaming" || key === "petSize" || key === "mascotSize") updateHitTesting();
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
    case "toggle-top": {
      const unpinning = preferences.alwaysOnTop;
      changeSetting("alwaysOnTop", !unpinning);
      if (unpinning && window?.isVisible()) window.moveTop();
      break;
    }
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
  ipcMain.on("pawmetry:drag", (event, phase, x, y) => {
    if (!isLocalSender(event, window, petUrl) || !window.isVisible() || preferences.clickThrough) return;
    if (phase === "end") { petDrag = undefined; return; }
    if (![x, y].every((value) => Number.isFinite(value) && Math.abs(value) <= 100_000)) return;
    if (phase === "start") { petDrag = { x, y, bounds: window.getBounds() }; return; }
    if (phase !== "move" || !petDrag) return;
    const dx = Math.round(x - petDrag.x), dy = Math.round(y - petDrag.y);
    const origin = petDrag.bounds;
    const target = fitBounds({ ...origin, x: origin.x + dx, y: origin.y + dy }, screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea);
    const current = window.getBounds();
    if (target.x !== current.x || target.y !== current.y) window.setPosition(target.x, target.y);
  });
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
      case "live-quota": case "disable-live-quota": setLiveQuota(action === "live-quota"); break;
      case "pause-monitoring": case "resume-monitoring": case "refresh": command(action); break;
      case "next-scenario": advance(); break;
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

async function start() {
  await app.whenReady();
  const selected = screen.getAllDisplays().find((display) => display.id === preferences.monitor);
  const { workArea } = selected ?? screen.getPrimaryDisplay();
  const [width, height] = dimensions[preferences.mode][preferences.windowSizes[preferences.mode]];
  const wanted = { x: workArea.x + workArea.width - width - 20, y: workArea.y + 24, ...preferences.bounds, width, height };
  const initial = fitBounds(wanted, selected?.workArea ?? screen.getDisplayMatching(wanted).workArea);
  window = newPetWindow(initial);
  connectRendererIpc();
  const menu = buildControlMenu();
  await window.loadFile(local("index.html"));
  const rendererLoadMs = Math.round(performance.now());
  paint();
  if (restoreSmoke) {
    assert.deepEqual(window.getBounds(), preferences.bounds, "saved bounds after restarting Electron");
    assert.deepEqual(window.getSize(), [...dimensions.dashboard.small]);
    assert.equal(preferences.petSize, "large");
    if (cat) assert.equal(preferences.mascotSize, 143);
    assert.equal(preferences.theme, "light");
    assert.equal(preferences.alwaysOnTop, true);
    assert.equal(window.isAlwaysOnTop(), true, "a fresh window honors the saved pin preference");
    console.log("Desktop restarted with saved window bounds, independent pet size, and pin preference.");
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
    if (cat) {
      await until(() => window.webContents.executeJavaScript(`document.body.dataset.mascot === 'cat'
        && document.querySelector('.cat-sprite img').getAnimations().length === 1`), "Cat loaded from its local bundle");
      assert.equal(await window.webContents.executeJavaScript(`(() => {
        const img = document.querySelector('.cat-sprite img');
        const animation = img.getAnimations()[0];
        const keyframes = animation.effect.getKeyframes();
        return keyframes.length === 9 && keyframes[0].transform === 'translate(0%, -20%)'
          && keyframes[1].transform === 'translate(-12.5%, -20%)';
      })()`), true, "running advances through the correct source cells");
      changeSetting("roaming", true);
      await until(() => window.webContents.executeJavaScript(`(() => {
        const box = document.querySelector('.cat-sprite');
        const animation = box.getAnimations()[0];
        if (!animation) return false;
        const duration = animation.effect.getTiming().duration;
        animation.currentTime = duration / 4;
        const right = new DOMMatrixReadOnly(getComputedStyle(box).transform).a;
        animation.currentTime = duration * 3 / 4;
        return right === 1 && new DOMMatrixReadOnly(getComputedStyle(box).transform).a === -1;
      })()`), "Cat faces both directions while roaming");
      changeSetting("reducedMotion", true);
      await until(() => window.webContents.executeJavaScript(`document.querySelector('.cat-sprite img').getAnimations().length === 0`), "reduced motion holds a Cat frame");
      changeSetting("reducedMotion", false);
      changeSetting("roaming", false);
      for (const mode of modes) {
        selectMode(mode);
        selectSize("large");
        const bounds = window.getBounds();
        changeSetting("mascotSize", 192);
        await until(() => window.webContents.executeJavaScript(`(() => {
          const rect = document.querySelector('.cat-sprite').getBoundingClientRect();
          const stage = document.querySelector('.stage').getBoundingClientRect();
          return document.body.dataset.layout === '${mode}' && rect.width === 192 && rect.height === 192
            && rect.top >= stage.top && rect.bottom <= stage.bottom;
        })()`), "the 192 px Cat fits the large " + mode + " stage");
        changeSetting("mascotSize", 64);
        await until(() => window.webContents.executeJavaScript(`document.querySelector('.cat-sprite').getBoundingClientRect().width === 64`), "Cat shrinks independently");
        assert.deepEqual(window.getBounds(), bounds);
        selectSize("small");
        changeSetting("mascotSize", 192);
        await until(() => window.webContents.executeJavaScript(`(() => {
          const rect = document.querySelector('.cat-sprite').getBoundingClientRect();
          const stage = document.querySelector('.stage').getBoundingClientRect();
          return document.body.style.getPropertyValue('--mascot-size') === '192px' && rect.width > 0
            && rect.width < 192 && rect.top >= stage.top && rect.bottom <= stage.bottom;
        })()`), "oversized Cat fits the small " + mode + " stage");
      }
      changeSetting("mascotSize", 143);
      console.log("Cat atlas rendered and animated.");
    } else {
      assert.equal(await window.webContents.executeJavaScript(`!document.querySelector('.cat-sprite img').hasAttribute('src')
        && getComputedStyle(document.querySelector('.placeholder')).display !== 'none'`), true, "unavailable assets use the fallback");
      console.log("Mascot fallback rendered.");
    }
    for (const mode of ["dashboard", "pet", "compact", "dashboard"]) {
      selectMode(mode);
      for (const size of ["large", "small", "standard", "large", "standard", "small"]) {
        selectSize(size);
        const [width, height] = dimensions[mode][size];
        assert.deepEqual(window.getSize(), [width, height], "native size after preset change");
        assert.equal(window.isAlwaysOnTop(), true, "layout and size changes preserve native topmost state");
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
    assert.equal(window.isAlwaysOnTop(), true, "the replacement renderer window preserves native topmost state");
    console.log("Desktop restored a stale renderer without resetting desktop state.");
    await smokeControls(menu);
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
  nativeTheme.on("updated", updateTrayIcon);
  tray.setToolTip("Pawmetry");
  tray.setContextMenu(menu);
  tray.on("double-click", recover);
  if (bundledQuota && process.argv.includes("--live-quota")) {
    void endpointTask.then((server) => {
      if (server && !closing && !preferences.liveQuotaDisabled) setLiveQuota(true, false);
    });
  }
  for (const event of ["display-removed", "display-metrics-changed"]) screen.on(event, () => { companionMenu.close(); keepOnDisplay(); settings.recover(); paint(); });
  powerMonitor.on("resume", () => { wakeAt = Date.now() + 2000; });
  if (preferences.shortcut && !chooseShortcut(preferences.shortcut)) preferences.shortcut = null;
  if (visiblePerformance || (!performanceSmoke && !preferences.hidden)) window.showInactive();
  updateHitTesting();
  let lastScenario = Date.now();
  timer = setInterval(() => {
    if (wakeAt && Date.now() >= wakeAt && (!liveSelected || monitoringPaused || live.refresh(true))) wakeAt = 0;
    if (!wakeAt) live.refresh();
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
    console.log(JSON.stringify({ visible: visiblePerformance, mode: "simulation", rendererLoadMs, samples }));
    app.quit();
  }
}

function buildControlMenu() {
  controlMenu = Menu.buildFromTemplate([
    { label: "Show or hide pet", click: toggleVisible },
    { id: "settings", label: "Settings", click: () => command("settings") },
    ...(bundledQuota ? [] : [{ id: "live-quota", label: "Live Codex quota", type: "checkbox", click: (item) => setLiveQuota(item.checked) }]),
    { label: "Refresh live quota", click: () => command("refresh") },
    { label: "Display mode", submenu: modes.map((value) => ({ label: value === "pet" ? "Pet only" : value === "compact" ? "Compact" : "Dashboard",
      click: () => changeSetting("mode", value) })) },
    { id: "animation-pause", label: "Pause animations", type: "checkbox", click: (item) => pauseAnimation(item.checked) },
    { id: "monitoring-pause", label: "Pause monitoring", type: "checkbox", click: (item) => pauseMonitoring(item.checked) },
    ...(bundledQuota ? [] : [{ label: "Next scenario", click: advance }]),
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
  const pet = localWindow({ ...bounds, transparent: true, frame: false,
    skipTaskbar: true, resizable: false, show: false }, local("preload.cjs"), !smoke);
  if (preferences.alwaysOnTop) setPinned(pet, true);
  for (const event of ["hide", "blur", "closed"]) pet.on(event, () => { if (window === pet) petDrag = undefined; });
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
      showPet();
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
  app.on("second-instance", () => { if (!closing) recover(); });
  const disposeDesktop = () => {
    clearInterval(timer);
    clearInterval(hitTimer);
    clearTimeout(viewportTimer);
    nativeTheme.off("updated", updateTrayIcon);
    globalShortcut.unregisterAll();
    tray?.destroy();
  };
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
      // Discovery must not advertise a vacant slot while this process still owns the lock.
      app.releaseSingleInstanceLock();
      await windowsEndpoint("clear", server.endpoint).catch(() => {});
    });
    void Promise.allSettled([stopping, closingEndpoint]).then(() => {
      disposeDesktop();
      app.exit(0);
    });
  });
  app.on("will-quit", disposeDesktop);
  start().catch((error) => {
    if (smoke) console.error(error);
    console.error("The Pawmetry simulation window could not start.");
    app.exit(1);
  });
} else {
  app.quit();
}
