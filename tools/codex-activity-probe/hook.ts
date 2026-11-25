import { createSocket } from "node:dgram";
import { hex } from "../../packages/ipc/protocol.ts";
import { maxHookBytes, projectHook, sealDiagnostic, sealObservation } from "./protocol.ts";
import { withinWorkspace } from "./windows-command.ts";

async function main() {
  const port = Number(process.argv[2]);
  const token = process.argv[3] ?? "";
  const workspace = process.argv[4];
  const name = process.argv[5];
  const root = process.argv[6];
  const challenge = process.argv[7];
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !hex.test(token)
    || (workspace !== "A" && workspace !== "B")) return;

  const diagnostic = (kind: "unsupported-input" | "wrong-workspace") =>
    sealDiagnostic({ workspace, sentAt: Date.now(), kind }, token);
  let packet: Buffer;
  if (root && !withinWorkspace(root, process.cwd())) {
    if (challenge) return;
    packet = diagnostic("wrong-workspace");
  }
  else {
    const observation = await readObservation(name, token, workspace);
    if (!observation) {
      if (challenge) return;
      packet = diagnostic("unsupported-input");
    }
    else if (challenge) {
      if (!/^[a-f0-9]{32}$/.test(challenge)) return;
      packet = sealDiagnostic({ workspace, sentAt: Date.now(), kind: "probe", challenge }, token);
    } else packet = sealObservation(observation, token);
  }
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
    socket.send(packet, port, "127.0.0.1", () => {
      socket.off("error", close);
      close();
    });
  });
}

async function readObservation(name: string, token: string, workspace: "A" | "B") {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > maxHookBytes) return null;
    chunks.push(chunk);
  }
  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return payload?.hook_event_name === name ? projectHook(payload, token, workspace) : null;
  } catch { return null; }
}

// Stop expects JSON. An empty object adds no context and makes no decision.
await main().catch(() => {});
if (process.argv[5] === "Stop") process.stdout.write("{}\n");
