import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fitBounds, loadPreferences, preferences, savePreferences } from "../apps/desktop/preferences.ts";
import { quotaAlerts } from "../apps/desktop/quota-alerts.ts";
import { animationStyle, frameAt, motionFor, prototypeProfile } from "../packages/animation/animation.ts";
import type { Status } from "../packages/ipc/protocol.ts";
import { scenarios, simulate } from "../packages/simulation/scenarios.ts";

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
  assert.doesNotMatch(await readFile(path, "utf8"), /live|clickThrough/);
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

test("low-quota alerts require opt-in fresh live data and rearm only after recovery", () => {
  const take = quotaAlerts();
  const status: Status = { mode: "live", quota: "fresh", validUntil: 1000, activity: "unknown",
    energy: { remaining: 20, resetAt: null }, stamina: { remaining: null, resetAt: null } };
  assert.equal(take(status, false).length, 0);
  assert.equal(take({ ...status, mode: "simulation" }, true).length, 0);
  assert.equal(take({ ...status, quota: "stale" }, true).length, 0);
  assert.deepEqual(take(status, true), [{ meter: "energy", remaining: 20 }]);
  assert.equal(take(status, true).length, 0);
  take({ ...status, energy: { remaining: 26, resetAt: null } }, true);
  assert.equal(take(status, true).length, 1);
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
