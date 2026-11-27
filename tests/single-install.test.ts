import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { askStatus, listenStatus } from "../packages/ipc/transport.ts";
import { loadCompanion, startCompanion } from "../apps/vscode/companion.cjs";

const build = { version: "0.1.10", fingerprint: "a".repeat(12) };
const bundle = { ...build, executable: "bundled-path" };
const status = { mode: "simulation", quota: "offline", validUntil: null,
  energy: { remaining: null, resetAt: null }, stamina: { remaining: null, resetAt: null } } as const;

test("managed identity is authenticated on demand and preserves the old quota response shape", async () => {
  const ipc = await listenStatus((op) => op === "identify" ? { ...status, build } : status);
  try {
    assert.deepEqual(await askStatus(ipc.endpoint, "identify"), { ...status, build });
    assert.deepEqual(await askStatus(ipc.endpoint, "status"), status);
  } finally { await ipc.close(); }
});

test("the companion launcher verifies the exact bundled executable", async () => {
  const root = await mkdtemp(join(tmpdir(), "pawmetry-bundle-test-"));
  try {
    await mkdir(join(root, "companion"));
    const executable = join(root, "companion", "Pawmetry.exe");
    const bytes = "synthetic executable";
    await writeFile(executable, bytes);
    await writeFile(join(root, "companion-build.json"), JSON.stringify({ ...build,
      executableSha256: createHash("sha256").update(bytes).digest("hex") }));
    assert.equal((await loadCompanion(root)).fingerprint, build.fingerprint);
    await writeFile(executable, "changed");
    await assert.rejects(loadCompanion(root), /digest mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("companion launch requires consent, reuses a running instance and upgrades only older managed builds", async () => {
  const old = { key: "old" };
  const current = { key: "current" };
  for (const [running, consent, expected, wanted] of [
    [null, false, "cancelled", ["start"]],
    [null, true, "connected", ["start", "launch"]],
    [build, true, "connected", ["show"]],
    [{ ...build, version: "0.1.11" }, true, "connected", ["show"]],
    ["legacy", true, "existing", ["show"]],
    [{ ...build, version: "0.1.2" }, false, "cancelled", ["update"]],
    [{ ...build, version: "0.1.2" }, true, "connected", ["update", "quit", "launch"]],
  ] as const) {
    let endpoint: { key: string } | null = running ? old : null;
    const actions: string[] = [];
    assert.equal(await startCompanion({ bundle, async read() { return endpoint; },
      async ask(target: {key: string}, op: string) {
        assert.equal(target, endpoint);
        if (op === "status") return status;
        if (op === "identify") return target === current ? { build } : running === "legacy" ? null : { build: running };
        actions.push(op);
        if (op === "quit") endpoint = null;
        return status;
      }, async confirm(action: string) { actions.push(action); return consent; },
      async launch(path: string) { assert.equal(path, bundle.executable); actions.push("launch"); endpoint = current; },
      async pause() {},
    }), expected);
    assert.deepEqual(actions, wanted);
  }
});
