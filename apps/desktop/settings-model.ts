import { modes, shortcuts, sizes, themes } from "./preferences.ts";
import { alertKinds } from "./quota-alerts.ts";

const booleanSettings = ["alwaysOnTop", "clickThrough", "reducedMotion", "energyBar", "staminaBar", "hoverInfo", "roaming", "quietHours"];
const choices = {
  mode: modes, windowSize: sizes, petSize: sizes, theme: themes, shortcut: [null, ...shortcuts],
  backgroundOpacity: [0, 0.5, 0.8, 1], petOpacity: [0.5, 0.75, 1], speed: [0.5, 1, 1.5, 2],
  energyThreshold: [10, 20, 30, 40, 50], staminaThreshold: [10, 20, 30, 40, 50],
};

export function validSetting(key: unknown, value: unknown, displays: number[]): boolean {
  if (typeof key !== "string") return false;
  if (booleanSettings.includes(key)) return typeof value === "boolean";
  if (Object.hasOwn(choices, key)) return (choices[key as keyof typeof choices] as readonly unknown[]).includes(value);
  if (key === "monitor") return value === null || (typeof value === "number" && displays.includes(value));
  return alertKinds.some((kind) => key === "alert-" + kind) && ["off", "silent", "sound"].includes(value as string);
}
