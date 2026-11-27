import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import launcher from "../apps/vscode/companion.cjs";
import { windowsEndpoint } from "../packages/ipc/discovery.ts";
import { askStatus } from "../packages/ipc/transport.ts";

const staged = resolve(process.argv[2] ?? "");
const bundle = await launcher.loadCompanion(staged);
const older = "0.1.0";
const root = resolve(".cache");
await mkdir(root, { recursive: true });
const base = await mkdtemp(join(root, "bundled-upgrade-"));
const profile = join(base, "profile");
const settings = join(profile, "companion.json");
const namespace = randomBytes(16).toString("hex");
const ns = JSON.stringify(namespace);
await mkdir(profile);
await writeFile(settings, '{"theme":"light","mascotSize":143}');

async function fixture(label, version, fingerprint) {
  const directory = join(base, label);
  await cp(staged, directory, { recursive: true });
  const app = join(directory, "companion", "resources", "app");
  for (const file of [join(directory, "companion-build.json"), join(app, "build-info.json")]) {
    const value = JSON.parse(await readFile(file, "utf8"));
    await writeFile(file, JSON.stringify({ ...value, version, fingerprint: fingerprint ?? value.fingerprint }));
  }
  const main = join(app, "apps", "desktop", "main.mjs");
  let content = await readFile(main, "utf8");
  const edits = [
    ['const menu = buildControlMenu();', 'const menu = buildControlMenu(); assert.equal(menu.getMenuItemById("live-quota"), null);'],
    ['const live = createLiveQuota();', 'const live = createLiveQuota(Date.now, async () => { throw new Error("Synthetic offline Codex"); });'],
    [': join(app.getPath("appData"), packagedInfo?.catReview || (!packagedInfo && cat) ? "Pawmetry Cat Review" : "Pawmetry");', `: ${JSON.stringify(profile)};`],
    ['windowsEndpoint("read")', `windowsEndpoint("read", undefined, ${ns})`],
    ['windowsEndpoint("publish", server.endpoint, undefined, existing)', `windowsEndpoint("publish", server.endpoint, ${ns}, existing)`],
    ['windowsEndpoint("clear", server.endpoint)', `windowsEndpoint("clear", server.endpoint, ${ns})`],
  ];
  for (const [before, after] of edits) {
    assert.ok(content.includes(before), before);
    content = content.replaceAll(before, after);
  }
  await writeFile(main, content);
  return launcher.loadCompanion(directory);
}

const read = () => windowsEndpoint("read", undefined, namespace);
const actions = [];
const launch = (bundle) => launcher.startCompanion({ bundle, read, ask: askStatus,
  async confirm(action) { actions.push(action); return true; } });
async function stop() {
  const current = await read();
  if (current) {
    await askStatus(current, "quit").catch(() => null);
    for (let attempt = 0; attempt < 10 && await read(); attempt++) await pause(350);
  }
  assert.equal(await read(), null, "disposable endpoint removed");
}
try {
  const old = await fixture("old", older, "bbbbbbbbbbbb");
  const latest = await fixture("new", bundle.version);
  assert.equal(await launch(old), "connected", "first bundled launch");
  const first = await read();
  assert.equal((await askStatus(first, "identify")).build.version, older);
  assert.equal(await launch(old), "connected", "reusing a bundled companion");
  assert.equal((await read()).key, first.key);
  assert.equal(await launch(latest), "connected", "restarting an older bundled companion");
  const second = await read();
  assert.notEqual(second.key, first.key);
  assert.equal((await askStatus(second, "identify")).build.version, bundle.version);
  let status;
  for (let attempt = 0; attempt < 12; attempt++) {
    status = await askStatus(second, "status");
    if (status.quota === "unavailable") break;
    await pause(150);
  }
  assert.equal(status.mode, "live");
  assert.equal(status.quota, "unavailable", "start automatically tried live quota without using demo values");
  assert.equal(status.energy.remaining, null);
  assert.equal(status.stamina.remaining, null);
  assert.deepEqual(actions, ["start", "update"]);
  const saved = JSON.parse(await readFile(settings, "utf8"));
  assert.equal(saved.theme, "light");
  assert.equal(saved.mascotSize, 143);
  await stop();
  await writeFile(settings, JSON.stringify({ ...saved, liveQuotaDisabled: true }));
  assert.equal(await launch(latest), "connected", "restarting with quota explicitly off");
  const disabled = await read();
  await pause(350);
  const off = await askStatus(disabled, "status");
  assert.equal(off.mode, "live");
  assert.equal(off.quota, "paused");
  assert.equal(off.energy.remaining, null);
  console.log("Windows lifecycle fixture passed: launch, reuse, authenticated upgrade, live startup, offline status, and persistent opt-out.");
} finally { await stop(); }
