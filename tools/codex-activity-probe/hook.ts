import { createSocket } from "node:dgram";
import { maxHookBytes, projectHook, tokenPattern } from "./protocol.ts";

async function main() {
  const port = Number(process.argv[2]);
  const token = process.argv[3] ?? "";
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !tokenPattern.test(token)) return;

  const input: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > maxHookBytes) return;
    input.push(chunk);
  }
  const observation = projectHook(JSON.parse(Buffer.concat(input).toString("utf8")), token);
  if (!observation) return;
  const socket = createSocket("udp4");
  await new Promise<void>((resolve) => {
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      socket.close();
      resolve();
    };
    socket.once("error", close);
    socket.send(JSON.stringify({ ...observation, token }), port, "127.0.0.1", () => {
      socket.off("error", close);
      close();
    });
  });
}

// This observer has no output or policy decision. A local delivery failure never blocks the tool.
await main().catch(() => {});
