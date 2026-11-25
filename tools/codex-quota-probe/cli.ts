import { extname, isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import { ProbeError, probeQuota } from "./app-server.ts";
import { discoverCodex } from "./discovery.ts";
import { renderQuota, windowFreshness } from "./quota.ts";

const usage = `Usage: npm run quota:probe -- [--codex <absolute path to native Codex>] [--show-workspace]

Reads one quota snapshot using existing Codex-managed ChatGPT sign-in.
On Windows x64, looks for a single bundled native executable in the default local VS Code install.
--codex           Use an explicitly selected trusted executable.
--show-workspace  Show the provider's workspace label locally when supplied.`;

function usableExecutable(path: string | undefined): path is string {
  if (!path || !isAbsolute(path)) return false;
  return process.platform !== "win32" || (/^[A-Za-z]:[\\/]/.test(path) && extname(path).toLowerCase() === ".exe");
}

async function run() {
  let args;
  try {
    args = parseArgs({ options: {
      codex: { type: "string" },
      "show-workspace": { type: "boolean" },
      help: { type: "boolean" },
    } });
  } catch {
    console.error(usage);
    return 2;
  }
  if (args.values.help) {
    console.log(usage);
    return 0;
  }
  let executable = args.values.codex;
  if (executable !== undefined && !usableExecutable(executable)) {
    console.error(usage);
    return 2;
  }
  if (executable === undefined) {
    const discovered = await discoverCodex();
    if (discovered.status !== "found") {
      const message = {
        missing: "No eligible OpenAI Codex executable was found in the default VS Code extension directory.",
        ambiguous: "More than one eligible OpenAI Codex installation was found.",
        unsupported: "Automatic discovery is available for local Windows x64 installations.",
      }[discovered.status];
      console.error(`${message} Supply the trusted native executable using --codex.`);
      return 2;
    }
    executable = discovered.executable;
    console.log(`OpenAI VS Code extension bundle ${discovered.version}`);
  }

  const abort = new AbortController();
  const cancel = () => abort.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const snapshot = await probeQuota(executable, { showWorkspace: args.values["show-workspace"], signal: abort.signal });
    const now = Date.now();
    console.log(renderQuota(snapshot, now));
    const hasUsableWindow = snapshot.buckets.some((bucket) => bucket.windows.some((window) =>
      window.usedPercent !== null && windowFreshness(window, snapshot.retrievedAtMs, now) === "fresh",
    ));
    return hasUsableWindow ? 0 : 1;
  } catch (error) {
    const message = error instanceof ProbeError ? error.message : "The quota probe could not complete.";
    console.error(`Quota: unknown. ${message}`);
    return 1;
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}

process.exitCode = await run();
