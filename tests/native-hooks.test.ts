import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { discoverCodex } from "../tools/codex-quota-probe/discovery.ts";

test("native Codex lists project hooks and notices cleanup without trusting or executing a hook",
  { skip: process.platform !== "win32" || process.env.PAWMETRY_NATIVE_HOOKS_TEST !== "1", timeout: 20_000 },
  async () => {
    const installed = await discoverCodex();
    assert.equal(installed.status, "found");
    if (installed.status !== "found") return;
    const root = await mkdtemp(join(tmpdir(), "pawmetry-native-hooks-"));
    const profile = join(root, "profile");
    const cwd = join(root, "project");
    const folder = join(cwd, ".codex");
    try {
      await mkdir(profile);
      await mkdir(folder, { recursive: true });
      await writeFile(join(profile, "config.toml"),
        "[projects." + JSON.stringify(cwd) + ']\ntrust_level="trusted"\n[analytics]\nenabled=false\n');
      const env: NodeJS.ProcessEnv = { CODEX_HOME: profile };
      for (const name of ["SystemRoot", "WINDIR", "USERPROFILE", "TEMP", "TMP", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH"]) {
        env[name] = process.env[name];
      }
      const child = spawn(installed.executable, ["app-server", "--listen", "stdio://", "-c",
        'cli_auth_credentials_store="file"', "-c", "features.apps=false"],
        { cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
      const closed = once(child, "close");
      const deadline = setTimeout(() => child.kill(), 15_000);
      child.stdin.on("error", () => {});
      const output = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
      let id = 0;
      const send = (frame: object) => child.stdin.write(JSON.stringify(frame) + "\n");
      const request = async (method: string, params: object) => {
        const expected = ++id;
        send({ id: expected, method, params });
        for (;;) {
          const event = await output.next();
          assert.equal(event.done, false, "App Server disconnected");
          const frame = JSON.parse(event.value);
          if (frame.id !== expected) continue;
          assert.ok(frame.result, "Expected a documented App Server response");
          return frame.result;
        }
      };
      const list = async () => {
        const { data } = await request("hooks/list", { cwds: [cwd] });
        assert.equal(data[0].errors.length, 0);
        return data[0].hooks.filter((hook: { source: string }) => hook.source === "project");
      };
      try {
        await request("initialize", {
          clientInfo: { name: "pawmetry_hook_test", version: "0.1.0" }, capabilities: { experimentalApi: true },
        });
        send({ method: "initialized" });
        assert.equal((await list()).length, 0);
        const file = join(folder, "hooks.json");
        await writeFile(file, JSON.stringify({
          hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "echo discovery-only", timeout: 1 }] }] },
        }), { flag: "wx" });
        const hooks = await list();
        assert.equal(hooks.length, 1);
        assert.equal(hooks[0].eventName, "preToolUse");
        assert.equal(hooks[0].trustStatus, "untrusted");
        await unlink(file);
        assert.equal((await list()).length, 0);
      } finally {
        child.stdin.end();
        await closed;
        clearTimeout(deadline);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
