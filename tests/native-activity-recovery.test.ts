import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { lstat, open, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join, normalize } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { invokeHelper } from "../tools/codex-activity-probe/helper.ts";

test("an unexpected activity receiver exit revokes both routes and releases the verified executable",
  { skip: process.platform !== "win32" || process.env.PAWMETRY_NATIVE_HELPER_TEST !== "1", timeout: 15_000 }, async () => {
    const moduleUrl = new URL("../tools/codex-activity-probe/receiver.ts", import.meta.url).href;
    const code = `const { prepareReceiver } = await import(${JSON.stringify(moduleUrl)});
      const receiver = await prepareReceiver();
      console.log(JSON.stringify({ paths: receiver.paths, executable: receiver.executable, probe: await receiver.probe() }));
      process.stdin.resume();`;
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      stdio: ["pipe", "pipe", "ignore"], windowsHide: true,
    });
    child.stdin.on("error", () => {});
    const closed = once(child, "close");
    const reader = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    let root: string | undefined;
    let executable: string | undefined;
    try {
      const line = await reader.next();
      assert.equal(line.done, false, "test receiver started");
      const setup = JSON.parse(line.value);
      const candidate = dirname(setup.paths.A);
      assert.match(basename(candidate), /^Pawmetry-activity-[a-f0-9]{32}$/);
      assert.equal(dirname(candidate).toLowerCase(), normalize(process.env.LOCALAPPDATA!).toLowerCase());
      assert.equal((await lstat(candidate)).isSymbolicLink(), false);
      assert.equal(setup.paths.A, join(candidate, "workspace-a"));
      assert.equal(setup.paths.B, join(candidate, "workspace-b"));
      assert.equal(dirname(setup.executable), candidate);
      assert.match(basename(setup.executable), /^PawmetryActivity-[a-f0-9]{64}\.exe$/);
      root = candidate;
      executable = setup.executable;
      assert.deepEqual(setup.probe, { A: "passed", B: "passed" });
      await assert.rejects(async () => { await (await open(executable!, "r+")).close(); }, /EBUSY|EACCES|EPERM/);
      child.kill();
      await closed;
      const stale = await invokeHelper(executable!, ["probe", "A", setup.paths.A, "1".repeat(32)], setup.paths.A);
      assert.equal(stale, 2, "the old route cannot acknowledge a frame after the receiver dies");
      for (let attempt = 0; ; attempt++) {
        try { await (await open(executable!, "r+")).close(); break; }
        catch (error) { if (attempt === 20) throw error; await delay(50); }
      }
    } finally {
      child.kill();
      await closed;
      if (root && executable) {
        for (const label of ["a", "b"]) {
          const workspace = join(root, "workspace-" + label);
          await unlink(join(workspace, ".codex", "hooks.json"));
          await rmdir(join(workspace, ".codex"));
          await rmdir(workspace);
          await unlink(join(root, "ingress-" + label + ".bin"));
        }
        await unlink(executable);
        await rmdir(root);
      }
    }
  });
