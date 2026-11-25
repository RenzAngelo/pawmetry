import { createHmac } from "node:crypto";

export const maxHookBytes = 64 * 1024;
export const tokenPattern = /^[a-f0-9]{64}$/;

export type ToolObservation = {
  provider: "codex";
  event: "tool-started";
  session: string;
};

export function projectHook(input: unknown, key: string): ToolObservation | null {
  if (!input || typeof input !== "object" || !tokenPattern.test(key)) return null;
  const fields = input as Record<string, unknown>;
  const session = fields.session_id;
  if (fields.hook_event_name !== "PreToolUse" || typeof session !== "string"
    || !session.trim() || session.length > 256) return null;
  return {
    provider: "codex",
    event: "tool-started",
    session: createHmac("sha256", key).update("codex-session\0").update(session).digest("hex"),
  };
}

export function acceptObservation(message: Buffer, key: string): ToolObservation | null {
  if (message.length > 512) return null;
  try {
    const { token, provider, event, session } = JSON.parse(message.toString("utf8"));
    if (token === key && provider === "codex" && event === "tool-started"
      && typeof session === "string" && tokenPattern.test(session)) {
      return { provider, event, session };
    }
  } catch {
    // Malformed datagrams are discarded.
  }
  return null;
}
