import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { fields, hex } from "../../packages/ipc/protocol.ts";
import { isInstant } from "../../packages/telemetry/model.ts";

export const maxHookBytes = 64 * 1024;
export const deliveryWindowMs = 10_000;
export const hookEvents = {
  SessionStart: "session-started", SessionEnd: "session-ended",
  PreToolUse: "tool-started", PostToolUse: "tool-ended",
  PreModelRequest: "model-started", PostModelRequest: "model-ended",
  Interrupt: "interrupted", Stop: "turn-stopped",
} as const;
export type HookName = keyof typeof hookEvents;
export type HookWorkspace = "A" | "B";
export type HookDiagnostic = { workspace: HookWorkspace; sentAt: number } &
  ({ kind: "probe"; challenge: string } | { kind: "unsupported-input" | "wrong-workspace" });
type EventName = (typeof hookEvents)[HookName];
export type HookObservation = {
  workspace: "A" | "B"; event: EventName; session: string; turn: string | null; tool: string | null;
  sentAt: number; delivery: string;
};
const kinds = Object.values(hookEvents);
const id = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 256;
const workspaceId = (value: unknown): value is "A" | "B" => value === "A" || value === "B";
const digest = (key: string, data: unknown) => createHmac("sha256", Buffer.from(key, "hex"))
  .update(JSON.stringify(data)).digest("hex");

export function projectHook(input: unknown, key: string, workspace: "A" | "B", sentAt = Date.now()): HookObservation | null {
  if (!input || typeof input !== "object" || !hex.test(key) || !workspaceId(workspace)) return null;
  const data = input as Record<string, unknown>;
  const name = data.hook_event_name;
  if (typeof name !== "string" || !Object.hasOwn(hookEvents, name) || !id(data.session_id)) return null;
  if (name === "SessionStart" && data.source !== "startup" && data.source !== "resume" && data.source !== "fork") return null;
  const event = hookEvents[name as HookName];
  const lifecycle = event === "session-started" || event === "session-ended";
  const toolEvent = event === "tool-started" || event === "tool-ended";
  if ((!lifecycle && !id(data.turn_id)) || (toolEvent && !id(data.tool_use_id))) return null;
  return {
    workspace, event, sentAt, delivery: randomBytes(16).toString("hex"),
    session: digest(key, ["session", workspace, data.session_id]),
    turn: lifecycle ? null : digest(key, ["turn", data.session_id, data.turn_id]),
    tool: toolEvent ? digest(key, ["tool", data.session_id, data.turn_id, data.tool_use_id]) : null,
  };
}

export function sealObservation(event: HookObservation, key: string): Buffer {
  return Buffer.from(JSON.stringify({ event, mac: digest(key, ["hook-v2", event]) }));
}

export function sealDiagnostic(value: HookDiagnostic, key: string): Buffer {
  return Buffer.from(JSON.stringify({ diagnostic: value, mac: digest(key, ["hook-diagnostic-v1", value]) }));
}

export function acceptDiagnostic(packet: Buffer, keys: Record<HookWorkspace, string>, now = Date.now()): HookDiagnostic | null {
  if (packet.length > 512) return null;
  try {
    const envelope = fields(JSON.parse(packet.toString("utf8")), ["diagnostic", "mac"]);
    const value = envelope?.diagnostic as Record<string, unknown> | null;
    if (!value || typeof value !== "object" || !workspaceId(value.workspace) || !isInstant(value.sentAt)
      || value.sentAt > now || now - value.sentAt > deliveryWindowMs || typeof envelope?.mac !== "string" || !hex.test(envelope.mac)) return null;
    const valid = value.kind === "probe" ? fields(value, ["workspace", "sentAt", "kind", "challenge"])
      && typeof value.challenge === "string" && /^[a-f0-9]{32}$/.test(value.challenge)
      : (value.kind === "unsupported-input" || value.kind === "wrong-workspace") && fields(value, ["workspace", "sentAt", "kind"]);
    if (!valid) return null;
    const expected = digest(keys[value.workspace], ["hook-diagnostic-v1", value]);
    return timingSafeEqual(Buffer.from(envelope.mac, "hex"), Buffer.from(expected, "hex")) ? value as HookDiagnostic : null;
  } catch { return null; }
}

export function acceptObservation(packet: Buffer, keys: Record<"A" | "B", string>, now = Date.now()): HookObservation | null {
  if (packet.length > 1024) return null;
  try {
    const envelope = fields(JSON.parse(packet.toString("utf8")), ["event", "mac"]);
    const event = fields(envelope?.event, ["workspace", "event", "session", "turn", "tool", "sentAt", "delivery"]);
    if (!event || !workspaceId(event.workspace) || !kinds.includes(event.event as EventName)
      || typeof event.session !== "string" || !hex.test(event.session)
      || typeof event.delivery !== "string" || !/^[a-f0-9]{32}$/.test(event.delivery)
      || !isInstant(event.sentAt) || event.sentAt > now || now - event.sentAt > deliveryWindowMs
      || typeof envelope?.mac !== "string" || !hex.test(envelope.mac)) return null;
    const lifecycle = event.event === "session-started" || event.event === "session-ended";
    const toolEvent = event.event === "tool-started" || event.event === "tool-ended";
    const validKey = (value: unknown) => typeof value === "string" && hex.test(value);
    if ((lifecycle ? event.turn !== null : !validKey(event.turn))
      || (toolEvent ? !validKey(event.tool) : event.tool !== null)) return null;
    const expected = digest(keys[event.workspace], ["hook-v2", event]);
    return timingSafeEqual(Buffer.from(envelope.mac, "hex"), Buffer.from(expected, "hex"))
      ? event as HookObservation : null;
  } catch {
    return null;
  }
}
