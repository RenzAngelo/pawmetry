import { createConnection, createServer, type Socket } from "node:net";
import { fields, frames, hex, loopback, matches, nonce, proof, validOperation, validStatus, version,
  type Endpoint, type Operation, type Status } from "./protocol.ts";

const deadlineMs = 1800;

export async function listenStatus(handle: (op: Operation) => Status) {
  const sockets = new Set<Socket>();
  const key = nonce();
  const server = createServer({ pauseOnConnect: true }, (socket) => {
    if (socket.remoteAddress !== loopback) return socket.destroy();
    sockets.add(socket);
    const deadline = setTimeout(() => socket.destroy(), deadlineMs);
    socket.on("error", () => socket.destroy());
    socket.once("close", () => { clearTimeout(deadline); sockets.delete(socket); });
    let client: string | null = null;
    const challenge = nonce();
    let served = false;
    frames(socket, (frame) => {
      if (served) { socket.destroy(); return; }
      if (!client) {
        const hello = fields(frame, ["v", "client"]);
        if (hello?.v !== version || typeof hello.client !== "string" || !hex.test(hello.client)) {
          socket.destroy(); return;
        }
        client = hello.client;
        socket.write(JSON.stringify({ server: challenge, mac: proof(key, "server", client, challenge) }) + "\n");
        return;
      }
      const request = fields(frame, ["op", "mac"]);
      const op = request?.op;
      if (!validOperation(op) || !matches(request?.mac, proof(key, "client", client, challenge, op))) {
        socket.destroy(); return;
      }
      served = true;
      const status = handle(op);
      if (!validStatus(status)) { socket.destroy(); return; }
      socket.end(JSON.stringify({ status, mac: proof(key, "result", client, challenge, JSON.stringify(status)) }) + "\n");
    });
    socket.resume();
  });
  server.maxConnections = 24;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: loopback, port: 0, backlog: 24 }, () => {
      server.off("error", reject);
      resolve();
    });
  });
  server.on("error", () => { for (const socket of sockets) socket.destroy(); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback endpoint unavailable");
  const endpoint: Endpoint = { v: version, port: address.port, key };
  return {
    endpoint,
    close: () => new Promise<void>((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    }),
  };
}

export function askStatus(endpoint: Endpoint, op: Operation): Promise<Status> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: loopback, port: endpoint.port });
    const deadline = setTimeout(() => socket.destroy(), deadlineMs);
    const client = nonce();
    let challenge: string | null = null;
    socket.on("error", () => socket.destroy());
    socket.once("close", () => { clearTimeout(deadline); reject(new Error("Desktop IPC unavailable")); });
    socket.once("connect", () => socket.write(JSON.stringify({ v: version, client }) + "\n"));
    frames(socket, (frame) => {
      if (!challenge) {
        const answer = fields(frame, ["server", "mac"]);
        if (typeof answer?.server !== "string" || !hex.test(answer.server)
          || !matches(answer.mac, proof(endpoint.key, "server", client, answer.server))) {
          socket.destroy(); return;
        }
        challenge = answer.server;
        socket.write(JSON.stringify({ op, mac: proof(endpoint.key, "client", client, challenge, op) }) + "\n");
        return;
      }
      const answer = fields(frame, ["status", "mac"]);
      if (validStatus(answer?.status) && matches(answer?.mac,
        proof(endpoint.key, "result", client, challenge, JSON.stringify(answer.status)))) resolve(answer.status);
      socket.destroy();
    });
  });
}
