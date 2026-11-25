import { randomBytes } from "node:crypto";
import { createSocket } from "node:dgram";
import { mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Source } from "../../packages/telemetry/model.ts";
import { SessionRegistry } from "../../packages/telemetry/session-registry.ts";
import { acceptObservation } from "./protocol.ts";

const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

async function run() {
  if (process.platform !== "win32" || process.argv[2] !== "--prepare-disposable") {
    console.log("Windows usage: npm run activity:probe -- --prepare-disposable");
    return process.argv.includes("--help") ? 0 : 2;
  }
  const root = await mkdtemp(join(tmpdir(), "pawmetry-activity-"));
  const token = randomBytes(32).toString("hex");
  const socket = createSocket("udp4");
  const registry = new SessionRegistry();
  const source: Source = { provider: "codex", sourceId: "local-hook-probe", mode: "live" };
  registry.connect(source, 1);
  const created = new Map<string, string>();
  let active = false;
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.bind(0, "127.0.0.1", () => {
        socket.off("error", reject);
        active = true;
        resolve();
      });
    });
    const port = socket.address().port;
    const executable = quote(process.execPath);
    const script = quote(fileURLToPath(new URL("./hook.ts", import.meta.url)));
    const command = `& ${executable} ${script} ${port} '${token}'`;
    const config = JSON.stringify({
      hooks: { PreToolUse: [{ hooks: [{ type: "command", command, timeout: 2 }] }] },
    }, null, 2);
    for (const name of ["workspace-a", "workspace-b"]) {
      const workspace = join(root, name);
      const folder = join(workspace, ".codex");
      await mkdir(folder, { recursive: true });
      const file = join(folder, "hooks.json");
      await writeFile(file, config, { flag: "wx" });
      created.set(file, config);
    }
    socket.on("message", (message, remote) => {
      if (remote.address !== "127.0.0.1") return;
      const observation = acceptObservation(message, token);
      if (!observation) return;
      const observedAtMs = Date.now();
      if (registry.observe({ source, generation: 1, session: observation.session,
        activity: observation.event, observedAtMs })) {
        console.log(JSON.stringify({ ...observation, observedAtMs }));
      }
    });
    console.log(`Disposable activity workspace A: ${join(root, "workspace-a")}`);
    console.log(`Disposable activity workspace B: ${join(root, "workspace-b")}`);
    console.log("Review the project hooks in Codex before testing. Close the disposable windows before pressing Ctrl+C.");
    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      socket.once("error", resolve);
    });
    return 0;
  } finally {
    registry.disconnect(source, 1);
    if (active) await new Promise<void>((resolve) => socket.close(() => resolve()));
    // Remove only the two files this run created. Preserve editor artifacts and user files.
    for (const [file, expected] of created) {
      try {
        if (await readFile(file, "utf8") === expected) await unlink(file);
        else console.error("A disposable hook configuration was edited and needs manual removal.");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error("A disposable hook configuration needs manual removal.");
        }
      }
    }
  }
}

process.exitCode = await run().catch(() => {
  console.error("The local activity probe could not start or clean up.");
  return 1;
});
