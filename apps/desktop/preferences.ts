import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";

export type Bounds = { x: number; y: number; width: number; height: number };
export type Preferences = {
  bounds: Bounds | null; alwaysOnTop: boolean; reducedMotion: boolean; lowQuotaAlerts: boolean;
};

export const defaults: Preferences = { bounds: null, alwaysOnTop: true, reducedMotion: false, lowQuotaAlerts: false };

export function preferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") return { ...defaults };
  const source = value as Record<string, unknown>;
  const bounds = source.bounds as Partial<Bounds> | null;
  const coordinate = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && Math.abs(n) <= 100_000;
  const valid = bounds && coordinate(bounds.x) && coordinate(bounds.y) && coordinate(bounds.width)
    && coordinate(bounds.height) && bounds.width >= 245 && bounds.width <= 760 && bounds.height >= 265 && bounds.height <= 760;
  const cleaned = valid ? { x: bounds.x!, y: bounds.y!, width: bounds.width!, height: bounds.height! } : null;
  return { bounds: cleaned, alwaysOnTop: source.alwaysOnTop !== false, reducedMotion: source.reducedMotion === true,
    lowQuotaAlerts: source.lowQuotaAlerts === true };
}

export function fitBounds(bounds: Bounds, area: Bounds): Bounds {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width, height,
  };
}

export function loadPreferences(path: string): Preferences {
  try {
    const bytes = readFileSync(path);
    if (bytes.length <= 4096) return preferences(JSON.parse(bytes.toString("utf8")));
  } catch { /* A missing or invalid settings file uses safe defaults. */ }
  return { ...defaults };
}

export function savePreferences(path: string, value: Preferences): void {
  const temporary = path + "." + randomBytes(8).toString("hex") + ".tmp";
  try {
    writeFileSync(temporary, JSON.stringify(preferences(value)), { flag: "wx" });
    renameSync(temporary, path);
  } catch {
    try { unlinkSync(temporary); } catch { /* No temporary file remains. */ }
  }
}
