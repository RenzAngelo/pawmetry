import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { defaults, dimensions, fitBounds, loadPreferences, placeCompanionMenu, placeSettings, preferences, savePreferences } from "../apps/desktop/preferences.ts";
import { validSetting } from "../apps/desktop/settings-model.ts";
import { enrollmentTargets } from "../apps/desktop/activity-setup.ts";
import { quotaAlerts } from "../apps/desktop/quota-alerts.ts";
import { animationStyle, frameAt, motionFor, prototypeProfile } from "../packages/animation/animation.ts";
import type { Status } from "../packages/ipc/protocol.ts";
import { scenarios, simulate } from "../packages/simulation/scenarios.ts";
import { spriteFrame, validateAtlas } from "../packages/animation/sprite-atlas.ts";

test("desktop saves only supported settings and recovers from invalid preferences", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pawmetry-prefs-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, "preferences.json");
  await writeFile(path, "{invalid");
  assert.equal(loadPreferences(path).alwaysOnTop, true);
  const value = preferences({ bounds: { x: -800, y: 70, width: 356, height: 368 },
    alwaysOnTop: false, lowQuotaAlerts: true, reducedMotion: true, live: true, clickThrough: true });
  savePreferences(path, value);
  assert.deepEqual(loadPreferences(path), value);
  assert.doesNotMatch(await readFile(path, "utf8"), /live/);
  assert.equal(loadPreferences(path).clickThrough, true);
  assert.equal(value.windowSizes.dashboard, "large");
  assert.equal(value.alerts.lowEnergy, "silent");
  const [width, height] = dimensions.pet.small;
  const petOnly = preferences({ ...value, mode: "pet", windowSizes: { ...value.windowSizes, pet: "small" },
    petSize: "large", backgroundOpacity: 0, bounds: { x: -800, y: 70, width, height } });
  savePreferences(path, petOnly);
  assert.deepEqual(loadPreferences(path), petOnly);
  savePreferences(path, { ...value, alwaysOnTop: true });
  assert.equal(loadPreferences(path).alwaysOnTop, true);
});

test("window bounds remain usable across negative monitor coordinates and removal", () => {
  const bounds = { x: -400, y: 950, width: 356, height: 368 };
  assert.deepEqual(fitBounds(bounds, { x: -1920, y: 0, width: 1920, height: 1040 }),
    { ...bounds, y: 672 });
  assert.deepEqual(fitBounds(bounds, { x: 0, y: 40, width: 300, height: 280 }),
    { x: 0, y: 40, width: 300, height: 280 });
});

test("options prefer the right and use other edges or contained minimum overlap", () => {
  const work = { x: -600, y: 40, width: 1200, height: 900 };
  const pet = { x: -280, y: 825, width: 136, height: 116 };
  assert.deepEqual(placeCompanionMenu(pet, work), { x: -136, y: 552, width: 256, height: 388 });
  assert.equal(placeCompanionMenu({ ...pet, x: 456 }, work).x, 192);
  const narrow = { x: -300, y: -1000, width: 300, height: 900 };
  const above = { ...pet, x: -220, y: -270 };
  assert.equal(placeCompanionMenu(above, narrow).y, above.y - 396);
  const below = { ...above, y: -975 };
  assert.equal(placeCompanionMenu(below, narrow).y, below.y + below.height + 8);
  const spare = { x: 40, y: 30, width: 280, height: 250 };
  const fallback = placeCompanionMenu({ x: 110, y: 90, width: 150, height: 140 }, spare);
  assert.deepEqual(fitBounds(fallback, spare), fallback);
});

test("Settings restores independently and recovers invalid or removed-monitor positions", () => {
  const primary = { x: 0, y: 40, width: 1280, height: 920 };
  const secondary = { x: -1920, y: 0, width: 1920, height: 1040 };
  const saved = { x: -450, y: 215, width: 680, height: 720 };
  assert.deepEqual(placeSettings(saved, primary, [primary, secondary]), { ...saved, x: -680 });
  const removed = { ...saved, x: -1600 };
  assert.deepEqual(placeSettings(removed, primary, [primary]), { ...saved, x: 300, y: 140 });
  assert.equal(preferences({ settingsBounds: { ...saved, width: Infinity } }).settingsBounds, null);
  assert.deepEqual(preferences({ settingsBounds: saved }).settingsBounds, saved);
});

test("Settings accepts only named preferences with exact bounded values", () => {
  const monitors = [123];
  assert.equal(validSetting("alwaysOnTop", true, monitors), true);
  assert.equal(validSetting("alwaysOnTop", "false", monitors), false);
  assert.equal(validSetting("alert-lowEnergy", "sound", monitors), true);
  assert.equal(validSetting("monitor", 123, monitors), true);
  assert.equal(validSetting("monitor", 222, monitors), false);
  assert.equal(validSetting("mode", "hide", monitors), false);
  assert.equal(validSetting("settingsBounds", { x: 0 }, monitors), false);
  assert.equal(validSetting("__proto__", {}, monitors), false);
  assert.equal(validSetting("theme", "light", monitors), true);
  assert.equal(preferences({ theme: "system" }).theme, "system");
  assert.equal(preferences({ theme: "off" }).theme, "dark");
});

test("activity previews target only an absolute local profile or selected project", () => {
  assert.deepEqual(enrollmentTargets("C:\\Users\\Example", undefined, "D:\\Games\\Project"), {
    user: "C:\\Users\\Example\\.codex\\hooks.json", project: "D:\\Games\\Project\\.codex\\hooks.json", customProfile: false,
  });
  assert.deepEqual(enrollmentTargets("C:\\Users\\Example", "C:\\Local Codex", "\\\\host\\work\\project"), {
    user: "C:\\Local Codex\\hooks.json", project: null, customProfile: true,
  });
  assert.equal(enrollmentTargets("C:\\Users\\Example", ".\\custom", null).user, null);
});

test("low-quota alerts require opt-in fresh live data and rearm only after recovery", () => {
  const take = quotaAlerts();
  const status: Status = { mode: "live", quota: "fresh", validUntil: 1000, activity: "unknown",
    energy: { remaining: 20, resetAt: null }, stamina: { remaining: null, resetAt: null } };
  const observation = { at: 25, scope: "test-scope", restored: [] };
  const settings = preferences({ lowQuotaAlerts: true });
  assert.equal(take(status, observation, defaults, 100).length, 0);
  assert.equal(take({ ...status, mode: "simulation" }, observation, settings, 100).length, 0);
  assert.equal(take({ ...status, quota: "stale" }, observation, settings, 100).length, 0);
  assert.deepEqual(take(status, observation, settings, 100), [{ message: "Energy at 20%", sound: false }]);
  assert.equal(take(status, observation, settings, 100).length, 0);
  take({ ...status, energy: { remaining: 26, resetAt: null } }, observation, settings, 100);
  assert.equal(take(status, observation, settings, 100).length, 1);
});

test("restoration and exhaustion are independent, deduplicated and honor local quiet hours", () => {
  const take = quotaAlerts();
  const now = new Date(2026, 10, 25, 6).getTime();
  const observation = { at: now, scope: "test-scope", restored: ["energy"] as ["energy"] };
  const status: Status = { mode: "live", quota: "fresh", validUntil: now + 10_000, activity: "unknown",
    energy: { remaining: 81, resetAt: now + 1000 }, stamina: { remaining: 0, resetAt: null } };
  const settings = preferences({ alerts: { restoredEnergy: "sound", exhaustion: "silent" } });
  assert.deepEqual(take(status, observation, { ...settings, quietHours: true }, now), []);
  assert.deepEqual(take(status, observation, settings, now), [], "quiet-hours notices are not replayed");
  assert.deepEqual(take(status, { ...observation, scope: "different-scope" }, settings, now), [
    { message: "Energy restored to 81%", sound: true }, { message: "Stamina allowance at 0%", sound: false },
  ]);
  assert.deepEqual(take(status, { ...observation, scope: "different-scope", at: now + 1000 }, settings, now + 1000), []);
});

test("animation covers the prototype states, configurable pacing and reduced motion", () => {
  for (const scenario of scenarios) {
    const pet = simulate(scenario, 1000).pet;
    const style = animationStyle(pet, motionFor(pet.pose), true);
    assert.equal(style.frozen, true);
  }
  const pet = simulate("normal", 1000).pet;
  const alternate = { ...prototypeProfile, walking: { frames: 12, fps: 24, width: 96, height: 48, loop: true } };
  const style = animationStyle(pet, "walking", false, alternate);
  assert.equal(style.width, 96);
  assert.ok(animationStyle({ ...pet, speed: 0.2 }, "walking", false, alternate).durationMs > style.durationMs);
  assert.equal(frameAt(alternate.walking, 1000), 0);
  assert.equal(frameAt(prototypeProfile.celebration, 5000), 7);
  assert.equal(frameAt(alternate.walking, 400, 1, true), 0);
});

test("sprite atlas validates dimensions and clip metadata and keeps the mirrored anchor aligned", () => {
  const config = { schema: 1, frameWidth: 128, frameHeight: 128, anchorX: 60, anchorY: 110,
    facing: "mirror", clips: prototypeProfile };
  const image = { width: 1024, height: 1280 };
  const atlas = validateAtlas(config, image);
  assert.ok(atlas);
  assert.equal(validateAtlas({ ...config, frameWidth: 500 }, image), null);
  assert.equal(validateAtlas({ ...config, clips: { ...config.clips, idle: { frames: 9, fps: 5, loop: true } } }, image), null);
  assert.deepEqual(spriteFrame(atlas, "walking", "left", 250),
    { x: 256, y: 128, width: 128, height: 128, anchorX: 67, anchorY: 110, mirror: true });
  const dual = validateAtlas({ ...config, facing: "dual" }, { ...image, height: 2560 });
  assert.ok(dual);
  const left = spriteFrame(dual, "working", "left", 500, 1, true);
  assert.equal(left.x, 0);
  assert.equal(left.y, 16 * 128);
  assert.equal(left.mirror, false);
});
