import type { PetState } from "../behavior/behavior.ts";

export type Motion = "idle" | "walking" | "running" | "slow-walking" | "exhaustion" | "sleeping"
  | "working" | "waiting" | "celebration" | "unknown";
export type Clip = { frames: number; fps: number; width: number; height: number; loop: boolean };
export type AnimationProfile = Record<Motion, Clip>;

const clip = (frames: number, fps: number, loop = true): Clip => ({ frames, fps, width: 80, height: 64, loop });
export const prototypeProfile: AnimationProfile = {
  idle: clip(4, 4), walking: clip(6, 8), running: clip(8, 14), "slow-walking": clip(4, 5),
  exhaustion: clip(4, 3), sleeping: clip(2, 2), working: clip(6, 10), waiting: clip(4, 5),
  celebration: clip(8, 12, false), unknown: clip(4, 3),
};

function validClip(clip: Clip | undefined): clip is Clip {
  return !!clip && Number.isInteger(clip.frames) && clip.frames >= 1 && clip.frames <= 256
    && Number.isFinite(clip.fps) && clip.fps >= 1 && clip.fps <= 120
    && Number.isInteger(clip.width) && clip.width >= 1 && clip.width <= 1024
    && Number.isInteger(clip.height) && clip.height >= 1 && clip.height <= 1024;
}

export function motionFor(pose: PetState["pose"]): Motion {
  switch (pose) {
    case "energetic": return "running";
    case "normal": return "walking";
    case "tired": return "slow-walking";
    case "exhausted": return "exhaustion";
    case "sleeping": return "sleeping";
    case "working":
    case "thinking": return "working";
    case "waiting": return "waiting";
    case "recharging": return "celebration";
    case "unknown":
    case "disconnected": return "unknown";
    default: return "idle";
  }
}

export function animationStyle(pet: PetState, motion: Motion, reduced: boolean,
  profile: AnimationProfile = prototypeProfile) {
  const candidate = profile[motion];
  const selected = validClip(candidate) ? candidate : prototypeProfile[motion];
  const paced = motion === "walking" || motion === "running" || motion === "slow-walking" || motion === "exhaustion"
    || (motion === "working" && pet.pose === "working");
  const speed = paced ? Math.max(0.15, Math.min(1, pet.speed)) : 1;
  return { ...selected, motion, durationMs: Math.round(1000 * selected.frames / (selected.fps * speed)),
    frozen: reduced || selected.frames === 1 };
}

export function frameAt(clip: Clip, elapsedMs: number, speed = 1, reduced = false): number {
  if (reduced || !validClip(clip) || !Number.isFinite(elapsedMs) || !Number.isFinite(speed)) return 0;
  const frame = Math.floor(Math.max(0, elapsedMs) * clip.fps * Math.max(0, Math.min(speed, 10)) / 1000);
  return clip.loop ? frame % clip.frames : Math.min(frame, clip.frames - 1);
}
