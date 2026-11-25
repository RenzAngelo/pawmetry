import { fields, hex } from "../../packages/ipc/protocol.ts";
import { isInstant } from "../../packages/telemetry/model.ts";

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
  workspace: HookWorkspace; event: EventName; session: string; turn: string | null; tool: string | null;
  sentAt: number; delivery: string;
};

const kinds = Object.values(hookEvents);
const workspaceId = (value: unknown): value is HookWorkspace => value === "A" || value === "B";
const fresh = (at: unknown, now: number): at is number => isInstant(at) && at <= now && now - at <= deliveryWindowMs;
const validKey = (value: unknown) => typeof value === "string" && hex.test(value);

export function readDiagnostic(raw: unknown, now: number): HookDiagnostic | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!workspaceId(value.workspace) || !fresh(value.sentAt, now)) return null;
  const valid = value.kind === "probe" ? fields(value, ["workspace", "sentAt", "kind", "challenge"])
    && typeof value.challenge === "string" && /^[a-f0-9]{32}$/.test(value.challenge)
    : (value.kind === "unsupported-input" || value.kind === "wrong-workspace") && fields(value, ["workspace", "sentAt", "kind"]);
  return valid ? value as HookDiagnostic : null;
}

export function readObservation(raw: unknown, now: number): HookObservation | null {
  const event = fields(raw, ["workspace", "event", "session", "turn", "tool", "sentAt", "delivery"]);
  if (!event || !workspaceId(event.workspace) || !kinds.includes(event.event as EventName) || !validKey(event.session)
    || typeof event.delivery !== "string" || !/^[a-f0-9]{32}$/.test(event.delivery) || !fresh(event.sentAt, now)) return null;
  const lifecycle = event.event === "session-started" || event.event === "session-ended";
  const toolEvent = event.event === "tool-started" || event.event === "tool-ended";
  if ((lifecycle ? event.turn !== null : !validKey(event.turn))
    || (toolEvent ? !validKey(event.tool) : event.tool !== null)) return null;
  return event as HookObservation;
}
