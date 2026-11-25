import { randomBytes } from "node:crypto";
import { createSocket } from "node:dgram";
import { mkdir, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptObservation, hookEvents } from "./protocol.ts";
import { HookTimeline } from "./timeline.ts";

const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

async function run() {
  if (process.platform !== "win32" || process.argv[2] !== "--prepare-disposable") {
    console.log("Windows usage: npm run activity:probe -- --prepare-disposable");
    return process.argv.includes("--help") ? 0 : 2;
  }
  const root = await mkdtemp(join(tmpdir(), "pawmetry-activity-"));
  const keys = { A: randomBytes(32).toString("hex"), B: randomBytes(32).toString("hex") };
  const socket = createSocket("udp4");
  const timeline = new HookTimeline();
  let timer: NodeJS.Timeout | undefined;
  let published = new Map<string, string>();
  const created = new Map<string, string>();
  let active = false;
  function report() {
    const previous = published;
    published = new Map();
    for (const item of timeline.states(Date.now())) {
      const key = item.workspace + ":" + item.session;
      published.set(key, item.state);
      if (previous.get(key) !== item.state) console.log(JSON.stringify({ source: "unverified-hook-probe", ...item }));
    }
  }
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
    for (const label of ["A", "B"] as const) {
      const config = JSON.stringify({
        hooks: Object.fromEntries(Object.keys(hookEvents).map((name) => [name, [{
          ...(name === "SessionStart" ? { matcher: "startup|resume|fork" } : {}),
          hooks: [{ type: "command", command: `& ${executable} ${script} ${port} '${keys[label]}' ${label} ${name}`, timeout: 2 }],
        }]])),
      }, null, 2);
      const workspace = join(root, "workspace-" + label.toLowerCase());
      const folder = join(workspace, ".codex");
      await mkdir(folder, { recursive: true });
      const file = join(folder, "hooks.json");
      await writeFile(file, config, { flag: "wx" });
      created.set(file, config);
    }
    socket.on("message", (message, remote) => {
      if (remote.address !== "127.0.0.1") return;
      const now = Date.now();
      const observation = acceptObservation(message, keys, now);
      if (observation && timeline.observe(observation, now)) report();
    });
    timer = setInterval(report, 1000);
    console.log(`Disposable activity workspace A: ${join(root, "workspace-a")}`);
    console.log(`Disposable activity workspace B: ${join(root, "workspace-b")}`);
    console.log("Review the project hooks in Codex before testing. Close the disposable windows before pressing Ctrl+C.");
    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      socket.once("error", resolve);
    });
    return 0;
  } finally {
    clearInterval(timer);
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
