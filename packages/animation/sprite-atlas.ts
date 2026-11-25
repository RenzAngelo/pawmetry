import { frameAt, type Motion } from "./animation.ts";

const motions: readonly Motion[] = ["idle", "walking", "running", "slow-walking", "exhaustion", "sleeping",
  "working", "waiting", "celebration", "unknown"];
export type SpriteClip = { frames: number; fps: number; loop: boolean };
export type SpriteAtlas = {
  schema: 1; frameWidth: number; frameHeight: number; anchorX: number; anchorY: number;
  facing: "mirror" | "dual"; clips: Record<Motion, SpriteClip>;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const bounded = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

export function validateAtlas(value: unknown, image: { width: number; height: number }): SpriteAtlas | null {
  const data = record(value);
  if (!data || data.schema !== 1 || (data.facing !== "mirror" && data.facing !== "dual")) return null;
  const { frameWidth, frameHeight, anchorX, anchorY, facing } = data;
  if (!bounded(frameWidth, 32, 256) || !bounded(frameHeight, 32, 256) || !Number.isInteger(frameWidth)
    || !Number.isInteger(frameHeight) || !bounded(anchorX, 0, frameWidth - 1) || !bounded(anchorY, 0, frameHeight - 1)
    || !Number.isInteger(anchorX) || !Number.isInteger(anchorY) || image.width !== frameWidth * 8
    || image.height !== frameHeight * motions.length * (facing === "dual" ? 2 : 1)) return null;
  const input = record(data.clips);
  if (!input || Object.keys(input).length !== motions.length) return null;
  const clips = {} as Record<Motion, SpriteClip>;
  for (const motion of motions) {
    const clip = record(input[motion]);
    if (!clip || !bounded(clip.frames, 1, 8) || !Number.isInteger(clip.frames) || !bounded(clip.fps, 1, 30)
      || typeof clip.loop !== "boolean") return null;
    clips[motion] = { frames: clip.frames, fps: clip.fps, loop: clip.loop };
  }
  return { schema: 1, frameWidth, frameHeight, anchorX, anchorY, facing, clips };
}

export function spriteFrame(atlas: SpriteAtlas, motion: Motion, facing: "left" | "right", elapsedMs: number,
  speed = 1, reduced = false) {
  const { frameWidth: width, frameHeight: height } = atlas;
  const column = frameAt({ ...atlas.clips[motion], width, height }, elapsedMs, speed, reduced);
  const left = facing === "left";
  const mirror = left && atlas.facing === "mirror";
  const row = motions.indexOf(motion) + (left && atlas.facing === "dual" ? motions.length : 0);
  return { x: column * width, y: row * height, width, height, mirror,
    anchorX: mirror ? width - 1 - atlas.anchorX : atlas.anchorX, anchorY: atlas.anchorY };
}
