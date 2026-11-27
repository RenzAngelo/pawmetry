import { modes, shortcuts, sizes, themes, validMascotSize } from "./preferences.ts";

const booleanSettings = ["alwaysOnTop", "clickThrough", "reducedMotion", "energyBar", "staminaBar", "hoverInfo", "roaming"];
const choices = {
  mode: modes, windowSize: sizes, petSize: sizes, theme: themes, shortcut: [null, ...shortcuts],
  backgroundOpacity: [0, 0.5, 0.8, 1], petOpacity: [0.5, 0.75, 1], speed: [0.5, 1, 1.5, 2],
};

export function validSetting(key: unknown, value: unknown, displays: number[]): boolean {
  if (typeof key !== "string") return false;
  if (booleanSettings.includes(key)) return typeof value === "boolean";
  if (key === "mascotSize") return validMascotSize(value);
  if (Object.hasOwn(choices, key)) return (choices[key as keyof typeof choices] as readonly unknown[]).includes(value);
  if (key === "monitor") return value === null || (typeof value === "number" && displays.includes(value));
  return false;
}
