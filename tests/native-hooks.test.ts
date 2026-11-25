import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { test } from "node:test";
import { discoverCodex } from "../tools/codex-quota-probe/discovery.ts";
import { hookConfig } from "../tools/codex-activity-probe/receiver.ts";

test("native Codex discovers independent disposable workspace hooks without approving or running them",
  { skip: process.platform !== "win32" || process.env.PAWMETRY_NATIVE_HOOKS_TEST !== "1", timeout: 30_000 },
  async () => {
    const installed = await discoverCodex();
    assert.equal(installed.status, "found");
    if (installed.status !== "found") return;
    const root = await mkdtemp(join(tmpdir(), "pawmetry-native-hooks-"));
    const profile = join(root, "profile");
    const activity = join(root, `Pawmetry-activity-${"a".repeat(32)}`);
    const workspaces = [join(activity, "workspace-a"), join(activity, "workspace-b")];
    const unreviewed = join(root, "workspace-unreviewed");
    const files = workspaces.map((cwd) => join(cwd, ".codex", "hooks.json"));
    try {
      await mkdir(profile);
      for (const cwd of [...workspaces, unreviewed]) await mkdir(join(cwd, ".codex"), { recursive: true });
      await writeFile(join(profile, "config.toml"), workspaces.map((cwd) =>
        "[projects." + JSON.stringify(cwd) + ']\ntrust_level="trusted"\n').join("\n") + "[analytics]\nenabled=false\n");
      const env: NodeJS.ProcessEnv = { CODEX_HOME: profile };
      for (const name of ["SystemRoot", "WINDIR", "USERPROFILE", "TEMP", "TMP", "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH"]) {
        env[name] = process.env[name];
      }
      const child = spawn(installed.executable, ["app-server", "--listen", "stdio://", "-c",
        'cli_auth_credentials_store="file"', "-c", "features.apps=false"],
        { cwd: workspaces[0], env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
      const closed = once(child, "close");
      const deadline = setTimeout(() => child.kill(), 24_000);
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
      const list = async (cwds = workspaces) => {
        const { data } = await request("hooks/list", { cwds });
        assert.equal(data.length, cwds.length);
        return data.map((entry: { errors: unknown[]; hooks: Array<{ source: string; eventName: string; trustStatus: string; currentHash: string }> }) => {
          assert.equal(entry.errors.length, 0);
          return entry.hooks.filter((hook) => hook.source === "project" || hook.source === "user");
        });
      };
      try {
        await request("initialize", {
          clientInfo: { name: "pawmetry_hook_test", version: "0.1.0" }, capabilities: { experimentalApi: true },
        });
        send({ method: "initialized" });
        assert.deepEqual((await list()).map((hooks: unknown[]) => hooks.length), [0, 0]);
        const helper = join(activity, `PawmetryActivity-${"a".repeat(64)}.exe`);
        const system = join(process.env.SystemRoot!, "System32");
        const configs = (["A", "B"] as const).map((label, index) => hookConfig(helper, label, workspaces[index], system));
        await Promise.all(configs.map((config, index) => writeFile(files[index], config, { flag: "wx" })));
        await writeFile(join(unreviewed, ".codex", "hooks.json"), configs[0]);
        assert.deepEqual((await list([unreviewed])).map((hooks: unknown[]) => hooks.length), [0],
          "a project layer without native project trust is skipped even with its hook file present");
        const initial = await list();
        for (const hooks of initial) {
          const names = Object.keys(JSON.parse(configs[0]).hooks).map((name) => name[0].toLowerCase() + name.slice(1));
          assert.deepEqual(hooks.map((hook: { eventName: string }) => hook.eventName).sort(), names.sort());
          assert.ok(hooks.every((hook: { trustStatus: string }) => hook.trustStatus === "untrusted"));
        }
        const hashes = (result: typeof initial) => result.map((hooks: { currentHash: string }[]) => hooks.map((hook) => hook.currentHash));
        assert.ok(hashes(initial).flat().every((hash: unknown) => typeof hash === "string" && hash.length > 0));
        await writeFile(helper, "synthetic non-executable fixture");
        assert.deepEqual(hashes(await list()), hashes(initial), "referenced file bytes are not part of a project hook trust hash");
        await writeFile(files[0], configs[0].replace('"timeout": 2', '"timeout": 3'));
        assert.notDeepEqual(hashes(await list())[0], hashes(initial)[0], "a change to the declaration changes its trust hash");
        await unlink(files[0]);
        assert.deepEqual((await list()).map((hooks: unknown[]) => hooks.length), [0, 8]);
        await unlink(files[1]);
        assert.deepEqual((await list()).map((hooks: unknown[]) => hooks.length), [0, 0]);
        const userHooks = join(profile, "hooks.json");
        await writeFile(userHooks, configs[0], { flag: "wx" });
        for (const hooks of await list()) {
          assert.equal(hooks.length, 8);
          assert.ok(hooks.every((hook: { source: string; trustStatus: string }) => hook.source === "user" && hook.trustStatus === "untrusted"));
        }
        await unlink(userHooks);
        assert.deepEqual((await list()).map((hooks: unknown[]) => hooks.length), [0, 0]);
      } finally {
        child.stdin.end();
        await closed;
        clearTimeout(deadline);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
