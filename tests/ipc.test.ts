import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { once } from "node:events";
import { test } from "node:test";
import { desktopClient } from "../packages/ipc/client.ts";
import { windowsEndpoint } from "../packages/ipc/discovery.ts";
import { loopback, maxFrameBytes, nonce, proof, validStatus, type Status } from "../packages/ipc/protocol.ts";
import { askStatus, listenStatus } from "../packages/ipc/transport.ts";

const status: Status = { mode: "live", quota: "fresh", activity: "unknown", validUntil: 20_000,
  energy: { remaining: 50, resetAt: 25_000 }, stamina: { remaining: 85, resetAt: null } };

test("multiple authenticated editor connections can read or request a fixed refresh", async (t) => {
  const requests: string[] = [];
  const server = await listenStatus((op) => { requests.push(op); return status; });
  t.after(server.close);
  const replies = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    askStatus(server.endpoint, i === 0 ? "refresh" : "status")));
  assert.deepEqual(replies, Array(5).fill(status));
  assert.equal(requests.filter((op) => op === "refresh").length, 1);
});

test("wrong key, malformed or oversized frames, and authenticated event injection never dispatch", async (t) => {
  let requests = 0;
  const server = await listenStatus(() => { requests++; return status; });
  t.after(server.close);
  await assert.rejects(askStatus({ ...server.endpoint, key: nonce() }, "refresh"));
  for (const frame of ["{broken\n", "a".repeat(maxFrameBytes + 1), '{"v":2,"client":"x"}\n']) {
    const socket = createConnection(server.endpoint.port, loopback);
    socket.on("error", () => {});
    const closed = once(socket, "close");
    socket.write(frame);
    await closed;
  }
  const client = nonce();
  const socket = createConnection(server.endpoint.port, loopback);
  const closed = once(socket, "close");
  socket.write(JSON.stringify({ v: 1, client }) + "\n");
  const [frame] = await once(socket, "data");
  const { server: challenge } = JSON.parse(frame.toString());
  socket.write(JSON.stringify({ op: "activity", mac: proof(server.endpoint.key, "client", client, challenge, "activity") }) + "\n");
  await closed;
  assert.equal(requests, 0);
});

test("a fresh challenge rejects replay and a fake server receives no command proof", async (t) => {
  let dispatched = 0;
  const server = await listenStatus(() => { dispatched++; return status; });
  t.after(server.close);
  const client = nonce();
  const request = async (previous?: string) => {
    const socket = createConnection(server.endpoint.port, loopback);
    const closed = once(socket, "close");
    socket.resume();
    socket.write(JSON.stringify({ v: 1, client }) + "\n");
    const [frame] = await once(socket, "data");
    const { server: challenge } = JSON.parse(frame.toString());
    const mac = previous ?? proof(server.endpoint.key, "client", client, challenge, "refresh");
    socket.write(JSON.stringify({ op: "refresh", mac }) + "\n");
    await closed;
    return mac;
  };
  await request(await request());
  assert.equal(dispatched, 1);

  let frames = 0;
  const fake = createServer((socket) => {
    socket.on("data", () => {
      frames++;
      socket.write(JSON.stringify({ server: nonce(), mac: nonce() }) + "\n");
    });
  });
  fake.listen(0, loopback);
  await once(fake, "listening");
  t.after(() => fake.close());
  const address = fake.address();
  assert.ok(address && typeof address !== "string");
  await assert.rejects(askStatus({ ...server.endpoint, port: address.port }, "refresh"));
  assert.equal(frames, 1);
});

test("editor discards stale endpoints and discovers a replacement after desktop restart", async (t) => {
  let now = 0;
  const first = await listenStatus(() => status);
  let endpoint = first.endpoint;
  let discoveries = 0;
  const client = desktopClient(async () => { discoveries++; return endpoint; }, () => now);
  assert.deepEqual(await client("status"), status);
  await first.close();
  assert.equal(await client("status"), null);
  const next = await listenStatus(() => status);
  t.after(next.close);
  endpoint = next.endpoint;
  assert.equal(await client("status"), null);
  now += 1000;
  assert.deepEqual(await client("status"), status);
  assert.equal(discoveries, 2);
});

test("simulation and stale frames cannot smuggle live meter data", () => {
  assert.equal(validStatus({ ...status, mode: "simulation" }), false);
  assert.equal(validStatus({ ...status, quota: "stale", validUntil: null }), false);
  assert.equal(validStatus({ ...status, validUntil: null }), false);
  assert.equal(validStatus(status), true);
});

test("the authenticated protocol permits only the two bounded window controls", async (t) => {
  const commands: string[] = [];
  const server = await listenStatus((command) => { commands.push(command); return status; });
  t.after(server.close);
  await askStatus(server.endpoint, "hide");
  await askStatus(server.endpoint, "show");
  await assert.rejects(askStatus({ ...server.endpoint, key: nonce() }, "hide"));
  assert.deepEqual(commands, ["hide", "show"]);
});

test("native Windows discovery publishes, verifies, replaces and clears a logon-scoped descriptor",
  { skip: process.platform !== "win32" || process.env.PAWMETRY_NATIVE_IPC_TEST !== "1", timeout: 30_000 },
  async () => {
    const suffix = nonce().slice(0, 32);
    const first = { v: 1 as const, port: 1234, key: nonce() };
    const second = { v: 1 as const, port: 1235, key: nonce() };
    try {
      assert.equal(await windowsEndpoint("read", undefined, suffix), null);
      await assert.doesNotReject(windowsEndpoint("publish", first, suffix), "Publish first descriptor");
      assert.deepEqual(await windowsEndpoint("read", undefined, suffix), first);
      await assert.rejects(windowsEndpoint("publish", second, suffix));
      await assert.doesNotReject(windowsEndpoint("publish", second, suffix, first), "Replace descriptor");
      assert.deepEqual(await windowsEndpoint("read", undefined, suffix), second);
      await assert.rejects(windowsEndpoint("publish", first, suffix, first), "A stale publisher must lose");
      await windowsEndpoint("clear", first, suffix);
      assert.deepEqual(await windowsEndpoint("read", undefined, suffix), second);
    } finally {
      const latest = await windowsEndpoint("read", undefined, suffix).catch(() => null);
      if (latest) await windowsEndpoint("clear", latest, suffix);
    }
    assert.equal(await windowsEndpoint("read", undefined, suffix), null);
  });

test("native Windows recovers a descriptor left by a terminated companion process",
  { skip: process.platform !== "win32" || process.env.PAWMETRY_NATIVE_IPC_TEST !== "1", timeout: 20_000 },
  async () => {
    const suffix = nonce().slice(0, 32);
    const child = spawn(process.execPath, ["--input-type=module", "-e", `
      import { listenStatus } from "./packages/ipc/transport.ts";
      import { windowsEndpoint } from "./packages/ipc/discovery.ts";
      const server = await listenStatus(() => (${JSON.stringify(status)}));
      await windowsEndpoint("publish", server.endpoint, process.argv[1]);
      console.log("ready");
    `, suffix], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
    const exited = once(child, "close");
    let server: Awaited<ReturnType<typeof listenStatus>> | undefined;
    try {
      const ready = await Promise.race([once(child.stdout, "data"), exited]);
      assert.match(String(ready[0]), /ready/);
      const previous = await windowsEndpoint("read", undefined, suffix);
      assert.ok(previous);
      assert.deepEqual(await askStatus(previous, "status"), status);
      child.kill("SIGKILL");
      await exited;
      assert.deepEqual(await windowsEndpoint("read", undefined, suffix), previous);
      await assert.rejects(askStatus(previous, "status"));
      server = await listenStatus(() => status);
      await windowsEndpoint("publish", server.endpoint, suffix, previous);
      await assert.rejects(askStatus({ ...server.endpoint, key: previous.key }, "status"));
      assert.deepEqual(await askStatus(server.endpoint, "status"), status);
    } finally {
      child.kill();
      await exited;
      if (server) await server.close();
      const endpoint = await windowsEndpoint("read", undefined, suffix);
      if (endpoint) await windowsEndpoint("clear", endpoint, suffix);
    }
  });
