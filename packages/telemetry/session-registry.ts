import { isInstant, sourceKey, type ActivityObservation, type ActivityState, type Source } from "./model.ts";

type Connection = {
  generation: number;
  connected: boolean;
  sessions: Map<string, ActivityObservation>;
};

export class SessionRegistry {
  private sources = new Map<string, Connection>();

  connect(source: Source, generation: number): void {
    const key = sourceKey(source);
    if (!Number.isSafeInteger(generation) || generation < 0 || generation <= (this.sources.get(key)?.generation ?? -1)) return;
    this.sources.set(key, { generation, connected: true, sessions: new Map() });
  }

  disconnect(source: Source, generation: number): void {
    const connection = this.sources.get(sourceKey(source));
    if (connection?.generation === generation) {
      connection.connected = false;
      connection.sessions.clear();
    }
  }

  observe(event: ActivityObservation): boolean {
    const connection = this.sources.get(sourceKey(event.source));
    if (!connection?.connected || connection.generation !== event.generation || !event.session || event.session.length > 256
      || !isInstant(event.observedAtMs)
      || (event.sequence !== undefined && (!Number.isSafeInteger(event.sequence) || event.sequence < 0))) return false;
    const previous = connection.sessions.get(event.session);
    if (previous && (previous.observedAtMs > event.observedAtMs
      || (previous.sequence !== undefined && (event.sequence === undefined || event.sequence <= previous.sequence))
      || (event.sequence === undefined && previous.observedAtMs === event.observedAtMs))) return false;
    if (!previous && connection.sessions.size >= 256) {
      const expired = [...connection.sessions.entries()].find(([, session]) =>
        event.observedAtMs - session.observedAtMs >= 60_000,
      );
      if (!expired) return false;
      connection.sessions.delete(expired[0]);
    }
    connection.sessions.set(event.session, { ...event, source: { ...event.source } });
    return true;
  }

  state(source: Source, session: string, now: number, ttlMs = 15_000): ActivityState {
    const connection = this.sources.get(sourceKey(source));
    if (!connection) return "unknown";
    if (!connection.connected) return "disconnected";
    const observation = connection.sessions.get(session);
    if (!observation || now < observation.observedAtMs || now - observation.observedAtMs >= ttlMs) return "unknown";
    return observation.activity;
  }
}
