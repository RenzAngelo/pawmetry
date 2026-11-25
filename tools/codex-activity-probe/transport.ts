import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Socket } from "node:net";
import type { HookWorkspace } from "./protocol.ts";

const maxPayload = 1024;
const helloBytes = 17;
const hmacBytes = 32;

export function hookProof(key: Buffer, role: "server" | "frame", hello: Buffer, frame?: Buffer): Buffer {
  const signer = createHmac("sha256", key).update(`pawmetry-hook-${role}-v3\0`).update(hello);
  if (frame) signer.update(frame);
  return signer.digest();
}

export async function listenForHooks(keys: Record<HookWorkspace, Buffer>, accept: (workspace: HookWorkspace, input: unknown) => boolean,
  onError: () => void) {
  const clients = new Set<Socket>();
  const server = createServer((socket) => {
    if (socket.remoteAddress !== "127.0.0.1") { socket.destroy(); return; }
    clients.add(socket);
    const deadline = setTimeout(() => socket.destroy(), 600);
    socket.once("close", () => { clearTimeout(deadline); clients.delete(socket); });
    socket.on("error", () => socket.destroy());
    socket.setNoDelay(true);
    const challenge = randomBytes(16);
    socket.write(challenge);
    let pending = Buffer.alloc(0);
    let label: HookWorkspace | undefined;
    let hello: Buffer;
    socket.on("data", (chunk: Buffer) => {
      if (pending.length + chunk.length > helloBytes + 2 + maxPayload + hmacBytes) { socket.destroy(); return; }
      pending = Buffer.concat([pending, chunk]);
      if (label === undefined) {
        if (pending.length < helloBytes) return;
        // Authenticate the receiver before the client sends any event metadata.
        if (pending.length !== helloBytes || (pending[0] !== 65 && pending[0] !== 66)) { socket.destroy(); return; }
        label = pending[0] === 65 ? "A" : "B";
        hello = Buffer.concat([challenge, pending]);
        pending = Buffer.alloc(0);
        socket.write(hookProof(keys[label], "server", hello));
        return;
      }
      if (pending.length < 2) return;
      const size = pending.readUInt16BE();
      const frameEnd = 2 + size;
      if (size === 0 || size > maxPayload || pending.length > frameEnd + hmacBytes) { socket.destroy(); return; }
      if (pending.length < frameEnd + hmacBytes) return;
      const frame = pending.subarray(0, frameEnd);
      if (!timingSafeEqual(hookProof(keys[label], "frame", hello, frame), pending.subarray(frameEnd))) { socket.destroy(); return; }
      socket.removeAllListeners("data");
      let ok = false;
      try { ok = accept(label, JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(frame.subarray(2)))); }
      catch { /* Reject malformed payloads without recording bytes. */ }
      socket.end(Buffer.from([ok ? 1 : 0]));
    });
  });
  server.maxConnections = 32;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); });
  });
  server.on("error", onError);
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Invalid activity listener");
  return { port: address.port, async close() {
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    for (const socket of clients) socket.destroy();
    await closed;
  } };
}
