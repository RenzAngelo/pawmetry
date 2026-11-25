import { createSocket } from "node:dgram";
import { hex } from "../../packages/ipc/protocol.ts";
import { maxHookBytes, projectHook, sealObservation } from "./protocol.ts";

async function main() {
  const port = Number(process.argv[2]);
  const token = process.argv[3] ?? "";
  const workspace = process.argv[4];
  const name = process.argv[5];
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !hex.test(token)
    || (workspace !== "A" && workspace !== "B")) return;

  const input: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > maxHookBytes) return;
    input.push(chunk);
  }
  const payload = JSON.parse(Buffer.concat(input).toString("utf8"));
  if (payload?.hook_event_name !== name) return;
  const observation = projectHook(payload, token, workspace);
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
    socket.send(sealObservation(observation, token), port, "127.0.0.1", () => {
      socket.off("error", close);
      close();
    });
  });
}

// Stop expects JSON. An empty object adds no context and makes no decision.
await main().catch(() => {});
if (process.argv[5] === "Stop") process.stdout.write("{}\n");
