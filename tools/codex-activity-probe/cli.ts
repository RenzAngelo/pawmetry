import { prepareReceiver } from "./receiver.ts";

async function run() {
  if (process.platform !== "win32" || process.argv[2] !== "--prepare-disposable") {
    console.log("Windows usage: npm run activity:probe -- --prepare-disposable");
    return process.argv.includes("--help") ? 0 : 2;
  }
  let stop: () => void = () => {};
  const done = new Promise<void>((resolve) => { stop = resolve; });
  const receiver = await prepareReceiver({ onError: stop });
  let published = new Map<string, string>();
  const timer = setInterval(() => {
    const previous = published;
    published = new Map();
    for (const item of receiver.states()) {
      const key = item.workspace + ":" + item.session;
      published.set(key, item.state);
      if (previous.get(key) !== item.state) console.log(JSON.stringify({ source: "codex-hook-observation", ...item }));
    }
  }, 1000);
  console.log(`Disposable activity workspace A: ${receiver.paths.A}`);
  console.log(`Disposable activity workspace B: ${receiver.paths.B}`);
  console.log(receiver.identity === "standard"
    ? "Review this exact helper and definition before native approval. Close the disposable windows before pressing Ctrl+C."
    : "Native activity is blocked under this Windows token. Keep the hooks pending. Press Ctrl+C to clean up.");
  process.once("SIGINT", stop);
  await done;
  clearInterval(timer);
  process.off("SIGINT", stop);
  if (!await receiver.close()) console.error("A disposable hook configuration needs manual removal.");
  return 0;
}

process.exitCode = await run().catch(() => {
  console.error("The local activity probe could not start or clean up.");
  return 1;
});
