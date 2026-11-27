import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const cat = fileURLToPath(new URL("../assets/mascots/cat/", import.meta.url));
// Measured gutters for the maintainer-supplied draft. Each row has its own spacing.
const yCuts = [0, 154, 300, 445, 592, 723, 846, 974, 1102, 1260, 1402];
const xCuts = [
  [0, 151, 300, 451, 601], [0, 152, 301, 450, 599, 749, 899],
  [0, 148, 291, 436, 577, 714, 855, 991, 1122], [0, 153, 302, 450, 600],
  [0, 152, 301, 451, 603], [0, 161, 306], [0, 152, 304, 456, 606, 752, 902],
  [0, 150, 302, 450, 601], [0, 148, 294, 431, 567, 706, 840, 977, 1122], [0, 151, 301, 449, 596],
];
// Projected body centers. The source shadows in the jump rows share a fixed ground line.
const centers = [
  [82, 235, 382, 532], [82, 235, 383, 531, 681, 830],
  [82, 225, 368, 511, 649, 791, 928, 1062], [82, 235, 383, 533],
  [82, 235, 382, 528], [85, 234], [82, 234, 383, 535, 681, 827],
  [82, 235, 383, 531], [82, 218, 364, 503, 637, 775, 907, 1047], [82, 235, 382, 527],
];

function repack(nativeImage) {
  const source = readFileSync(join(cat, "drafts", "Cat-atlas.png"));
  const digest = createHash("sha256").update(source).digest("hex");
  if (digest !== "f56ae9e2393366b1209914e0ac44029cb3ee3769209d6bb13f91650b40f2243d") throw new Error("The extraction guides only apply to the original Cat draft.");
  const original = nativeImage.createFromBuffer(source);
  const { width, height } = original.getSize();
  if (width !== 1122 || height !== 1402) throw new Error("Unexpected original draft dimensions.");
  const pixels = original.toBitmap();
  const sheet = Buffer.alloc(1024 * 1280 * 4);
  const scale = 0.80;
  const alpha = (x, y) => pixels[(y * width + x) * 4 + 3];
  for (const [row, cuts] of xCuts.entries()) {
    for (let column = 0; column < cuts.length - 1; column++) {
      const left = cuts[column], right = cuts[column + 1];
      const top = yCuts[row], bottom = yCuts[row + 1];
      let ground = top;
      for (let y = top; y < bottom; y++) {
        let widthOnLine = 0;
        for (let x = left; x < right; x++) if (alpha(x, y) >= 224) widthOnLine++;
        if (widthOnLine >= 8) ground = y;
      }
      if (row === 2) ground = 428;
      if (row === 8) ground = 1244;
      for (let y = 0; y < 128; y++) {
        const sy = Math.round(ground + (y - 112) / scale);
        if (sy < top || sy >= bottom) continue;
        for (let x = 0; x < 128; x++) {
          const sx = Math.round(centers[row][column] + (x - 64) / scale);
          if (sx < left || sx >= right || alpha(sx, sy) <= 16) continue;
          // Two working poses have detached turquoise specks above the laptop.
          if (row === 6 && (column === 2 || column === 3) && x >= 109 && y <= 80) continue;
          let hasSolidNeighbor = false;
          for (let dy = -2; dy <= 2 && !hasSolidNeighbor; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              if (sx + dx >= left && sx + dx < right && sy + dy >= top && sy + dy < bottom
                && alpha(sx + dx, sy + dy) >= 224) { hasSolidNeighbor = true; break; }
            }
          }
          if (!hasSolidNeighbor) continue;
          if (x === 0 || x === 127 || y === 0 || y === 127) throw new Error(`Artwork touches row ${row + 1}, column ${column + 1} frame edge.`);
          const sourceOffset = (sy * width + sx) * 4;
          const destination = ((row * 128 + y) * 1024 + column * 128 + x) * 4;
          pixels.copy(sheet, destination, sourceOffset, sourceOffset + 4);
        }
      }
    }
  }
  const output = join(cat, "drafts", "Cat-repacked.png");
  writeFileSync(output, nativeImage.createFromBitmap(sheet, { width: 1024, height: 1280 }).toPNG(), { flag: "wx" });
  console.log(`Wrote ${output}`);
}

if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const exe = createRequire(import.meta.url)("electron");
  const run = spawnSync(exe, [fileURLToPath(import.meta.url)], { env, stdio: "inherit", windowsHide: true });
  if (run.error) console.error(run.error.message);
  process.exitCode = run.status ?? 1;
} else {
  const { app, nativeImage } = await import("electron");
  const profile = fileURLToPath(new URL("../.cache/cat-atlas-repack/", import.meta.url));
  mkdirSync(profile, { recursive: true });
  app.setPath("userData", profile);
  try { repack(nativeImage); app.exit(0); }
  catch (error) { console.error(error.message); app.exit(1); }
}
