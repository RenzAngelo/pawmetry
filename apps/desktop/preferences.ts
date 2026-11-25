import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { alertKinds, type AlertMode, type AlertSettings } from "./quota-alerts.ts";

export type Bounds = { x: number; y: number; width: number; height: number };
export type DisplayMode = "pet" | "compact" | "dashboard";
export type Size = "small" | "standard" | "large";
export const modes = ["pet", "compact", "dashboard"] as const;
export const sizes = ["small", "standard", "large"] as const;
export const themes = ["dark", "light", "system"] as const;
export const dimensions: Record<DisplayMode, Record<Size, readonly [number, number]>> = {
  pet: { small: [136, 116], standard: [160, 136], large: [200, 166] },
  compact: { small: [252, 225], standard: [284, 250], large: [336, 275] },
  dashboard: { small: [264, 300], standard: [292, 320], large: [356, 368] },
};
export const shortcuts = ["CommandOrControl+Alt+Shift+P", "CommandOrControl+Alt+Shift+F10"] as const;
export type Preferences = AlertSettings & {
  bounds: Bounds | null; settingsBounds: Bounds | null; alwaysOnTop: boolean; reducedMotion: boolean; theme: (typeof themes)[number];
  mode: DisplayMode; hidden: boolean; windowSizes: Record<DisplayMode, Size>; petSize: Size;
  backgroundOpacity: number; petOpacity: number; speed: number; monitor: number | null;
  energyBar: boolean; staminaBar: boolean; hoverInfo: boolean; roaming: boolean; clickThrough: boolean;
  shortcut: (typeof shortcuts)[number] | null;
};

export const defaults: Preferences = {
  bounds: null, settingsBounds: null, alwaysOnTop: true, reducedMotion: false, theme: "dark",
  alerts: { lowEnergy: "off", lowStamina: "off", restoredEnergy: "off", restoredStamina: "off", exhaustion: "off" },
  lowThresholds: { energy: 20, stamina: 20 }, quietHours: false,
  mode: "dashboard", hidden: false, windowSizes: { pet: "standard", compact: "standard", dashboard: "standard" },
  petSize: "standard", backgroundOpacity: 1, petOpacity: 1, speed: 1, monitor: null,
  energyBar: true, staminaBar: true, hoverInfo: false, roaming: false, clickThrough: false, shortcut: null,
};

function parseBounds(value: unknown, minimum: number, maximum: number): Bounds | null {
  if (!value || typeof value !== "object") return null;
  const { x, y, width, height } = value as Partial<Bounds>;
  const coordinate = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && Math.abs(n) <= 100_000;
  return coordinate(x) && coordinate(y) && coordinate(width) && coordinate(height)
    && width >= minimum && width <= maximum && height >= minimum && height <= maximum ? { x, y, width, height } : null;
}

export function preferences(value: unknown): Preferences {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const cleaned = parseBounds(source.bounds, 1, 760);
  const size = (value: unknown): Size => value === "small" || value === "large" ? value : "standard";
  const storedSizes = source.windowSizes as Partial<Record<DisplayMode, Size>> | undefined;
  const number = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  const alerts = { ...defaults.alerts };
  for (const kind of alertKinds) {
    const value = (source.alerts as Partial<typeof alerts> | undefined)?.[kind] as AlertMode | undefined;
    if (value === "off" || value === "silent" || value === "sound") alerts[kind] = value;
    else if (source.lowQuotaAlerts === true && (kind === "lowEnergy" || kind === "lowStamina")) alerts[kind] = "silent";
  }
  const thresholds = source.lowThresholds as Partial<Preferences["lowThresholds"]> | undefined;
  return { bounds: cleaned, settingsBounds: parseBounds(source.settingsBounds, 200, 10_000),
    theme: themes.find((item) => item === source.theme) ?? defaults.theme,
    alwaysOnTop: source.alwaysOnTop !== false, reducedMotion: source.reducedMotion === true,
    alerts, lowThresholds: { energy: number(thresholds?.energy, 5, 50, 20), stamina: number(thresholds?.stamina, 5, 50, 20) },
    quietHours: source.quietHours === true,
    mode: source.mode === "pet" || source.mode === "compact" ? source.mode : "dashboard", hidden: source.hidden === true,
    windowSizes: { pet: size(storedSizes?.pet), compact: size(storedSizes?.compact), dashboard: size(storedSizes?.dashboard
      ?? Object.entries(dimensions.dashboard).find(([, [width, height]]) => width === cleaned?.width && height === cleaned?.height)?.[0]) },
    petSize: size(source.petSize), backgroundOpacity: number(source.backgroundOpacity, 0, 1, 1),
    petOpacity: number(source.petOpacity, 0.25, 1, 1), speed: number(source.speed, 0.25, 2, 1),
    monitor: typeof source.monitor === "number" && Number.isSafeInteger(source.monitor) ? source.monitor : null,
    energyBar: source.energyBar !== false, staminaBar: source.staminaBar !== false, hoverInfo: source.hoverInfo === true,
    roaming: source.roaming === true, clickThrough: source.clickThrough === true,
    shortcut: shortcuts.find((item) => item === source.shortcut) ?? null,
  };
}

export function placeSettings(saved: Bounds | null, fallback: Bounds, areas: Bounds[]): Bounds {
  let reachable: Bounds | undefined;
  let best = 0;
  if (saved) for (const area of areas) {
    const width = Math.min(area.x + area.width, saved.x + saved.width) - Math.max(area.x, saved.x);
    const height = Math.min(area.y + area.height, saved.y + saved.height) - Math.max(area.y, saved.y);
    if (width >= 64 && height >= 64 && width * height > best) { reachable = area; best = width * height; }
  }
  if (saved && reachable) return fitBounds(saved, reachable);
  const width = Math.min(saved?.width ?? 680, fallback.width);
  const height = Math.min(saved?.height ?? 720, fallback.height);
  return { width, height, x: fallback.x + Math.round((fallback.width - width) / 2),
    y: fallback.y + Math.round((fallback.height - height) / 2) };
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
  return preferences({});
}

export function savePreferences(path: string, value: Preferences): boolean {
  const temporary = path + "." + randomBytes(8).toString("hex") + ".tmp";
  try {
    writeFileSync(temporary, JSON.stringify(preferences(value)), { flag: "wx" });
    renameSync(temporary, path);
    return true;
  } catch {
    try { unlinkSync(temporary); } catch { /* No temporary file remains. */ }
    return false;
  }
}
