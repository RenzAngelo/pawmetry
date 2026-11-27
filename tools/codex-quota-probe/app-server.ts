import { spawn, type ChildProcessByStdio } from "node:child_process";
import { mkdtemp, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { asRecord, normalizeQuota } from "./quota.ts";

const failureMessages = {
  cancelled: "Probe cancelled.",
  startup: "The Codex App Server could not be started.",
  disconnected: "The Codex App Server disconnected before the read completed.",
  timeout: "The Codex App Server exceeded the probe deadline.",
  malformed: "The Codex App Server returned an invalid response.",
  unsupported: "This Codex App Server does not support the required protocol.",
  signedOut: "There is no active Codex-managed ChatGPT sign-in in this profile.",
  authMode: "This probe requires Codex-managed ChatGPT sign-in.",
  authRejected: "Codex could not authorize the read. Check sign-in and workspace in the official client.",
  scopeChanged: "Codex reported an account or workspace change during the read. Retry after it settles.",
  serverRequest: "The Codex App Server requested an action outside the quota protocol.",
  rejected: "The Codex App Server could not complete the read. Check sign-in, connectivity and plan support.",
  cleanup: "The probe could not confirm cleanup of its own Codex process or temporary directory.",
} as const;

type FailureCode = keyof typeof failureMessages;

export class ProbeError extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode) {
    super(failureMessages[code]);
    this.code = code;
  }
}

type AppServerChild = ChildProcessByStdio<Writable, Readable, null>;
type ProbeOptions = { showWorkspace?: boolean; timeoutMs?: number; signal?: AbortSignal };

const maxFrameBytes = 64 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });

async function* readFrames(stdout: Readable) {
  let pending = Buffer.alloc(0);
  for await (const chunk of stdout as AsyncIterable<Buffer>) {
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(10, start);
      const end = newline === -1 ? chunk.length : newline;
      const next = chunk.subarray(start, end);
      if (pending.length + next.length > maxFrameBytes) throw new ProbeError("malformed");
      pending = pending.length ? Buffer.concat([pending, next]) : next;
      if (newline === -1) break;

      let message: Record<string, unknown> | null;
      try {
        message = asRecord(JSON.parse(decoder.decode(pending)));
      } catch {
        throw new ProbeError("malformed");
      }
      if (!message) throw new ProbeError("malformed");
      pending = Buffer.alloc(0);
      start = newline + 1;
      yield message;
    }
  }
  if (pending.length) throw new ProbeError("malformed");
}

function rpcFailure(value: unknown): ProbeError {
  const error = asRecord(value);
  if (!error || !Number.isInteger(error.code)) return new ProbeError("malformed");
  if (error.code === -32601) return new ProbeError("unsupported");
  const message = error.message;
  if (error.code === 401 || error.code === 403
    || (typeof message === "string" && /\b(?:401 Unauthorized|403 Forbidden)\b/i.test(message))) {
    return new ProbeError("authRejected");
  }
  return new ProbeError("rejected");
}

type ReadMethod = "initialize" | "account/read" | "account/rateLimits/read";

async function readOnce(child: AppServerChild, showWorkspace: boolean) {
  const frames = readFrames(child.stdout);
  let id = 0;
  const write = (message: object) => child.stdin.write(JSON.stringify(message) + "\n");

  async function request(method: ReadMethod, params?: object): Promise<Record<string, unknown>> {
    const requestId = ++id;
    write({ id: requestId, method, params });
    for (;;) {
      const next = await frames.next();
      if (next.done) throw new ProbeError("disconnected");
      const frame = next.value;

      if (typeof frame.method === "string") {
        if (Object.hasOwn(frame, "id")) {
          throw new ProbeError(frame.method === "account/chatgptAuthTokens/refresh" ? "authMode" : "serverRequest");
        }
        if (frame.method === "account/updated") {
          const mode = asRecord(frame.params)?.authMode;
          if (method === "account/rateLimits/read") throw new ProbeError("scopeChanged");
          if (mode != null && mode !== "chatgpt") throw new ProbeError("authMode");
        }
        continue;
      }

      if (frame.id !== requestId || Object.hasOwn(frame, "error") === Object.hasOwn(frame, "result")) {
        throw new ProbeError("malformed");
      }
      if (Object.hasOwn(frame, "error")) throw rpcFailure(frame.error);
      const result = asRecord(frame.result);
      if (!result) throw new ProbeError("malformed");
      return result;
    }
  }

  try {
    const init = await request("initialize", {
      clientInfo: { name: "pawmetry_quota_probe", title: "Pawmetry Quota Probe", version: "0.1.0" },
    });
    if (typeof init.userAgent !== "string") throw new ProbeError("malformed");
    write({ method: "initialized" });

    const auth = await request("account/read", { refreshToken: false });
    if (auth.account === null) throw new ProbeError(auth.requiresOpenaiAuth === false ? "authMode" : "signedOut");
    const accountType = asRecord(auth.account)?.type;
    if (typeof accountType !== "string") throw new ProbeError("malformed");
    if (accountType !== "chatgpt") throw new ProbeError("authMode");

    const limits = await request("account/rateLimits/read");
    return normalizeQuota(limits, auth, Date.now(), showWorkspace);
  } finally {
    await frames.return(undefined);
  }
}

async function within(closed: Promise<void>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      closed.then(() => true),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), ms); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Owns and cleans up only the supplied child. It never discovers or attaches to another process. */
export async function readQuotaFromChild(child: AppServerChild, options: ProbeOptions = {}) {
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  let timer: NodeJS.Timeout | undefined;
  let abort: (() => void) | undefined;
  const failed = new Promise<never>((_, reject) => {
    const fail = (code: FailureCode) => reject(new ProbeError(code));
    child.on("error", () => fail(child.pid === undefined ? "startup" : "disconnected"));
    child.stdin.on("error", () => fail("disconnected"));
    timer = setTimeout(() => fail("timeout"), options.timeoutMs ?? 15_000);
    abort = () => fail("cancelled");
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
  });

  try {
    return await Promise.race([failed, readOnce(child, options.showWorkspace ?? false)]);
  } catch (error) {
    throw error instanceof ProbeError ? error : new ProbeError("disconnected");
  } finally {
    clearTimeout(timer);
    if (abort) options.signal?.removeEventListener("abort", abort);
    child.stdin.end();
    if (!await within(closed, 250)) {
      child.kill("SIGKILL");
      if (!await within(closed, 1_000)) throw new ProbeError("cleanup");
    }
  }
}

const nativeEnvironment = [
  "SystemRoot", "WINDIR", "SystemDrive", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
  "LOCALAPPDATA", "APPDATA", "TEMP", "TMP", "HOME", "CODEX_HOME",
];

export const appServerArgs = [
  "app-server", "--listen", "stdio://",
  "-c", "analytics.enabled=false",
  "-c", 'otel.exporter="none"',
  "-c", 'otel.trace_exporter="none"',
  "-c", 'otel.metrics_exporter="none"',
  "-c", "features.apps=false",
  "-c", "features.plugins=false",
  "-c", "features.hooks=false",
  "-c", "mcp_servers={}",
] as const;

export async function probeQuota(executable: string, options: ProbeOptions = {}) {
  if (options.signal?.aborted) throw new ProbeError("cancelled");
  const env: NodeJS.ProcessEnv = {};
  for (const name of nativeEnvironment) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }

  let cwd: string;
  try {
    cwd = await mkdtemp(join(tmpdir(), "pawmetry-quota-"));
  } catch {
    throw new ProbeError("startup");
  }

  try {
    const child = spawn(executable, appServerArgs, { cwd, env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
    return await readQuotaFromChild(child, options);
  } finally {
    await rmdir(cwd).catch(() => { throw new ProbeError("cleanup"); });
  }
}
