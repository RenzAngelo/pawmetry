import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hookEvents, readDiagnostic, readObservation, type HookName, type HookWorkspace } from "./protocol.ts";
import { HookTimeline } from "./timeline.ts";
import { privateActivityRoot } from "../../packages/ipc/discovery.ts";
import { hookCommand } from "./windows-command.ts";
import { installHelper, invokeHelper } from "./helper.ts";
import { listenForHooks } from "./transport.ts";

const labels = ["A", "B"] as const;
export function hookConfig(executable: string, label: HookWorkspace, root: string, system: string) {
  return JSON.stringify({
    hooks: Object.fromEntries(Object.keys(hookEvents).map((name) => [name, [{
      ...(name === "SessionStart" ? { matcher: "startup|resume|fork" } : {}),
      hooks: [{ type: "command", command: hookCommand(executable, label, name as HookName, root, system),
        timeout: 2, statusMessage: "Pawmetry activity metadata" }],
    }]])),
  }, null, 2);
}

export async function prepareReceiver({ packaged = false, onChange = () => {}, onError = () => {} } = {}) {
  const { root, system } = await privateActivityRoot();
  const paths = { A: join(root, "workspace-a"), B: join(root, "workspace-b") };
  const keys = { A: randomBytes(32), B: randomBytes(32) };
  const created = new Map<string, Buffer>();
  let helper: Awaited<ReturnType<typeof installHelper>> | undefined;
  let image: string | undefined;
  let listener: Awaited<ReturnType<typeof listenForHooks>> | undefined;
  let timeline = new HookTimeline();
  let paused = false;
  let resumedAt = 0;
  let closing: Promise<boolean> | undefined;
  const latest = new Map<HookWorkspace, { at: number; event: string }>();
  const seen = new Set<HookWorkspace>();
  const rejected = new Map<HookWorkspace, "unsupported-input" | "wrong-workspace">();
  const probes = new Map<string, HookWorkspace>();
  const hookFile = (label: HookWorkspace) => join(paths[label], ".codex", "hooks.json");
  const directory = async (path: string) => {
    const info = await lstat(path);
    return info.isDirectory() && !info.isSymbolicLink();
  };
  async function configuration(file: string) {
    try {
      const expected = created.get(file);
      const folder = dirname(file);
      if (!expected || !await directory(root) || (folder !== root &&
        (!await directory(dirname(folder)) || !await directory(folder)))) return "changed";
      const info = await lstat(file);
      return info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.size === expected.length
        && (await readFile(file)).equals(expected) ? "present" : "changed";
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unavailable";
    }
  }
  async function write(file: string, data: Buffer) {
    await writeFile(file, data, { flag: "wx" });
    created.set(file, data);
  }
  const close = () => closing ??= (async () => {
    // Cut off authentication and drain clients before deleting any files.
    await listener?.close();
    keys.A.fill(0);
    keys.B.fill(0);
    await helper?.close();
    let clean = true;
    for (const [file, expected] of created) {
      try {
        const check = await configuration(file);
        if (check === "present") await unlink(file);
        else if (check !== "missing") clean = false;
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") clean = false; }
      finally { expected.fill(0); }
    }
    try { if (image && await directory(root)) await unlink(image); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") clean = false; }
    const folders = Object.values(paths);
    for (const folder of [...folders.map((value) => join(value, ".codex")), ...folders, root]) {
      try { if (await directory(folder)) await rmdir(folder); } catch { /* Leave nonempty workspace content in place. */ }
    }
    return clean;
  })();

  try {
    helper = await installHelper(root, packaged, (file) => { image = file; }, onError);
    const { identity, path: executable, hash } = helper;
    listener = await listenForHooks(keys, (label, message) => {
      if (closing) return false;
      const now = Date.now();
      const diagnostic = readDiagnostic(message, now);
      if (diagnostic?.workspace === label && diagnostic.kind === "probe") {
        return probes.get(diagnostic.challenge) === label && probes.delete(diagnostic.challenge);
      }
      if (identity !== "standard" || paused) return false;
      if (diagnostic?.workspace === label && diagnostic.kind !== "probe" && diagnostic.sentAt >= resumedAt) {
        rejected.set(label, diagnostic.kind);
        onChange();
        return true;
      }
      const observed = readObservation(message, now);
      if (observed?.workspace !== label || observed.sentAt < resumedAt || !timeline.observe(observed, now)) return false;
      rejected.delete(label);
      latest.set(label, { at: now, event: observed.event });
      seen.add(label);
      onChange();
      return true;
    }, onError);
    for (const label of labels) {
      const descriptor = Buffer.alloc(34);
      descriptor.writeUInt16BE(listener.port);
      keys[label].copy(descriptor, 2);
      await write(join(root, `ingress-${label.toLowerCase()}.bin`), descriptor);
      await mkdir(dirname(hookFile(label)), { recursive: true });
      await write(hookFile(label), Buffer.from(hookConfig(executable, label, paths[label], system)));
    }
    return { paths, executable, hash, identity, close,
      states: (now = Date.now()) => timeline.states(now), aggregate: (now = Date.now()) => timeline.aggregate(now),
      async checkConfigurations() {
        return Object.fromEntries(await Promise.all(labels.map(async (label) => [label, await configuration(hookFile(label))])));
      },
      async probe() {
        return Object.fromEntries(await Promise.all(labels.map(async (label) => {
          if (closing) return [label, "receiver-unavailable"];
          if (await configuration(hookFile(label)) !== "present") return [label, "invalid-configuration"];
          const challenge = randomBytes(16).toString("hex");
          probes.set(challenge, label);
          try {
            const code = await invokeHelper(executable, ["probe", label, paths[label], challenge], paths[label]);
            if (code === 0 && !probes.has(challenge)) return [label, "passed"];
            return [label, closing ? "receiver-unavailable" : code === null ? "launch-failed" : "no-delivery"];
          } finally { probes.delete(challenge); }
        })));
      },
      diagnostics(now = Date.now()) {
        const states = timeline.states(now);
        return labels.map((label) => ({ label, path: paths[label], seen: seen.has(label), last: latest.get(label) ?? null,
          rejected: rejected.get(label) ?? null,
          states: states.filter((entry) => entry.workspace === label).map((entry) => entry.state) }));
      },
      setPaused(value: boolean) {
        if (paused === value) return;
        paused = value;
        if (paused) { timeline = new HookTimeline(); latest.clear(); rejected.clear(); }
        else resumedAt = Date.now();
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
