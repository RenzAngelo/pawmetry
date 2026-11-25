import { deliveryWindowMs, type HookObservation } from "./protocol.ts";

export type ObservedActivity = "working" | "interrupted" | "stale" | "disconnected" | "unknown";
type Tool = { ended: boolean; at: number };
type Session = {
  boundary: number; at: number; state: ObservedActivity; turn: string | null;
  tools: Map<string, Tool>; closedTurns: Map<string, number>;
  model: Tool | null; stoppedAt: number;
};
const workLeaseMs = 15_000;
const sessionRetentionMs = 300_000;

export class HookTimeline {
  private sessions = new Map<string, Session>();
  private deliveries = new Map<string, number>();

  private sweep(now: number): void {
    for (const [key, at] of this.deliveries) {
      if (now - at > deliveryWindowMs) this.deliveries.delete(key);
    }
    for (const [key, session] of this.sessions) {
      if (now - session.at > sessionRetentionMs) this.sessions.delete(key);
    }
  }

  observe(event: HookObservation, now: number): boolean {
    if (event.sentAt > now || now - event.sentAt > deliveryWindowMs) return false;
    this.sweep(now);
    if (this.deliveries.has(event.delivery) || this.deliveries.size >= 1024) return false;
    const key = event.workspace + ":" + event.session;
    let session = this.sessions.get(key);
    if (!session) {
      if (this.sessions.size >= 128) return false;
      session = { boundary: -1, at: -1, state: "unknown", turn: null, tools: new Map(), closedTurns: new Map(),
        model: null, stoppedAt: -1 };
      this.sessions.set(key, session);
    }
    this.deliveries.set(event.delivery, event.sentAt);
    if (event.sentAt < session.boundary) return false;
    if (event.event === "session-started" || event.event === "session-ended") {
      if (event.sentAt <= session.at) return false;
      session.boundary = session.at = event.sentAt;
      session.state = event.event === "session-ended" ? "disconnected" : "unknown";
      session.turn = null;
      session.tools.clear();
      session.model = null;
      session.stoppedAt = -1;
      session.closedTurns.clear();
      return true;
    }
    if (!event.turn || session.state === "disconnected" || session.closedTurns.has(event.turn)) return false;
    const terminal = event.event === "interrupted";
    if (terminal) {
      if (session.closedTurns.size >= 64) {
        const oldest = session.closedTurns.keys().next().value;
        if (oldest) session.closedTurns.delete(oldest);
      }
      session.closedTurns.set(event.turn, event.sentAt);
    }
    if (session.turn !== event.turn) {
      if (event.sentAt <= session.at) return false;
      session.turn = event.turn;
      session.tools.clear();
      session.model = null;
      session.stoppedAt = -1;
      session.state = "unknown";
    }
    if (event.sentAt < session.stoppedAt || (!terminal && event.sentAt === session.stoppedAt)) return false;
    if (terminal || event.event === "turn-stopped") {
      if (!terminal && event.sentAt < session.at) return false;
      session.tools.clear();
      session.model = null;
      session.stoppedAt = event.sentAt;
      session.state = terminal ? "interrupted" : "unknown";
    } else if (event.event === "model-started" || event.event === "model-ended") {
      if (session.model && event.sentAt <= session.model.at) return false;
      session.model = { ended: event.event === "model-ended", at: event.sentAt };
    } else {
      if (!event.tool) return false;
      const old = session.tools.get(event.tool);
      if (old && (old.ended || event.event === "tool-started" || event.sentAt < old.at)) return false;
      if (!old && session.tools.size >= 64) return false;
      session.tools.set(event.tool, { ended: event.event === "tool-ended", at: event.sentAt });
    }
    if (!terminal && event.event !== "turn-stopped") {
      session.state = (session.model && !session.model.ended) || [...session.tools.values()].some((tool) => !tool.ended)
        ? "working" : "unknown";
    }
    session.at = Math.max(session.at, event.sentAt);
    return true;
  }

  state(workspace: "A" | "B", sessionId: string, now: number): ObservedActivity {
    this.sweep(now);
    return this.status(this.sessions.get(workspace + ":" + sessionId), now);
  }

  private status(session: Session | undefined, now: number): ObservedActivity {
    if (!session || now < session.at) return "unknown";
    if (session.state === "disconnected") return "disconnected";
    if (session.state === "working") {
      const active = (work: Tool | null) => !!work && !work.ended && now - work.at < workLeaseMs;
      return active(session.model) || [...session.tools.values()].some(active) ? "working" : "stale";
    }
    if (now - session.at >= workLeaseMs) return "stale";
    return session.state;
  }

  states(now: number) {
    this.sweep(now);
    return [...this.sessions].map(([key, record]) => {
      const workspace = key.startsWith("A:") ? "A" : "B";
      const session = key.slice(2);
      return { workspace, session, state: this.status(record, now) };
    });
  }

  aggregate(now: number): ObservedActivity {
    const states = this.states(now).map((item) => item.state);
    for (const state of ["working", "interrupted", "stale", "unknown", "disconnected"] as const) {
      if (states.includes(state)) return state;
    }
    return "unknown";
  }
}
