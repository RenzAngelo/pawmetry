import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { validateAtlas } from "../../packages/animation/sprite-atlas.ts";

function boundedFile(path, limit) {
  const file = openSync(path, "r");
  try {
    const info = fstatSync(file);
    if (!info.isFile() || info.size === 0 || info.size > limit) throw new Error("Invalid mascot file size");
    const bytes = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(file, bytes, offset, bytes.length - offset, null);
      if (!count) throw new Error("Incomplete mascot file");
      offset += count;
    }
    return bytes;
  } finally { closeSync(file); }
}

export function loadCatAtlas(folder, decode) {
  try {
    const image = boundedFile(new URL("sprites.png", folder), 12 * 1024 * 1024);
    if (image.length < 33 || image.subarray(0, 16).toString("hex") !== "89504e470d0a1a0a0000000d49484452"
      || image.readUInt32BE(16) !== 1024 || image.readUInt32BE(20) !== 1280 || image[24] !== 8 || image[25] !== 6) return null;
    const atlas = validateAtlas(JSON.parse(boundedFile(new URL("atlas.json", folder), 8192)), decode(image));
    return atlas?.frameWidth === 128 && atlas.frameHeight === 128 && atlas.facing === "mirror"
      && atlas.anchorX === 64 && atlas.anchorY === 112 ? atlas : null;
  } catch { return null; }
}
