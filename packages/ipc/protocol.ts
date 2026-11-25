import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Socket } from "node:net";
import { isInstant } from "../telemetry/model.ts";

export const version = 1;
export const loopback = "127.0.0.1";
export const maxFrameBytes = 2048;
export const hex = /^[0-9a-f]{64}$/;
export const nonce = () => randomBytes(32).toString("hex");
const decoder = new TextDecoder("utf-8", { fatal: true });

export type Operation = "status" | "refresh" | "show" | "hide";
export type Endpoint = { v: 1; port: number; key: string };
export type Meter = { remaining: number | null; resetAt: number | null };
export type Status = {
  mode: "simulation" | "live";
  quota: "offline" | "loading" | "fresh" | "stale" | "unavailable";
  activity: "unknown";
  validUntil: number | null;
  energy: Meter;
  stamina: Meter;
};

export function fields(value: unknown, keys: string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  return Object.keys(item).length === keys.length && keys.every((key) => Object.hasOwn(item, key)) ? item : null;
}

export function readEndpoint(value: unknown): Endpoint | null {
  const item = fields(value, ["v", "port", "key"]);
  if (item?.v !== version || typeof item.port !== "number" || !Number.isInteger(item.port)
    || item.port < 1 || item.port > 65535 || typeof item.key !== "string" || !hex.test(item.key)) return null;
  return { v: version, port: item.port, key: item.key };
}

function validMeter(value: unknown): boolean {
  const item = fields(value, ["remaining", "resetAt"]);
  return !!item && (item.remaining === null || (typeof item.remaining === "number"
    && Number.isFinite(item.remaining) && item.remaining >= 0 && item.remaining <= 100))
    && (item.resetAt === null || isInstant(item.resetAt));
}

export function validStatus(value: unknown): value is Status {
  const item = fields(value, ["mode", "quota", "activity", "validUntil", "energy", "stamina"]);
  return !!item && (item.mode === "simulation" || item.mode === "live")
    && (item.quota === "offline" || item.quota === "loading" || item.quota === "fresh"
      || item.quota === "stale" || item.quota === "unavailable")
    && item.activity === "unknown" && (item.validUntil === null || isInstant(item.validUntil))
    && validMeter(item.energy) && validMeter(item.stamina)
    && validAvailability(item as unknown as Status);
}

function validAvailability(status: Status): boolean {
  if (status.mode === "simulation" ? status.quota !== "offline" : status.quota === "offline") return false;
  if (status.quota === "fresh") {
    return status.validUntil !== null && (status.energy.remaining !== null || status.stamina.remaining !== null);
  }
  return status.validUntil === null && [status.energy, status.stamina].every((meter) =>
    meter.remaining === null && meter.resetAt === null,
  );
}

export function proof(key: string, role: "server" | "client" | "result", client: string, server: string, body = "") {
  return createHmac("sha256", Buffer.from(key, "hex"))
    .update(JSON.stringify(["pawmetry-ipc", version, role, client, server, body])).digest("hex");
}

export function matches(value: unknown, expected: string): boolean {
  return typeof value === "string" && hex.test(value)
    && timingSafeEqual(Buffer.from(value, "hex"), Buffer.from(expected, "hex"));
}

export function frames(socket: Socket, receive: (frame: unknown) => void) {
  let pending = Buffer.alloc(0);
  socket.on("data", (chunk: Buffer) => {
    let offset = 0;
    try {
      while (offset < chunk.length) {
        const newline = chunk.indexOf(10, offset);
        const end = newline < 0 ? chunk.length : newline;
        const next = chunk.subarray(offset, end);
        if (next.length + pending.length > maxFrameBytes) throw new Error("Oversized IPC frame");
        pending = Buffer.concat([pending, next]);
        if (newline < 0) return;
        const value: unknown = JSON.parse(decoder.decode(pending));
        pending = Buffer.alloc(0);
        receive(value);
        if (socket.destroyed) return;
        offset = newline + 1;
      }
    } catch {
      socket.destroy();
    }
  });
}
