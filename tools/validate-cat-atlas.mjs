import { spawnSync } from "node:child_process";
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const args = process.argv.slice(2);
const cat = fileURLToPath(new URL("../assets/mascots/cat/", import.meta.url));

if (!process.versions.electron) {
  try {
    inputOptions();
    const electron = createRequire(import.meta.url)("electron");
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(electron, [fileURLToPath(import.meta.url), ...args], { env, stdio: "inherit", windowsHide: true });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
} else {
  const { app, nativeImage } = await import("electron");
  const profile = fileURLToPath(new URL("../.cache/cat-atlas-validator/", import.meta.url));
  mkdirSync(profile, { recursive: true });
  app.setPath("userData", profile);
  try {
    const { path, shouldImport } = inputOptions();
    checkAtlas(nativeImage, path, shouldImport);
    app.exit(0);
  } catch (error) {
    console.error(error.message);
    app.exit(1);
  }
}

function inputOptions() {
  const { values, positionals } = parseArgs({ args, options: { import: { type: "boolean" } }, allowPositionals: true });
  if (positionals.length > 1) throw new Error("Usage: npm run mascot:check -- [path-to-png] [--import]");
  return { path: positionals[0] ?? join(cat, "drafts", "Cat-atlas.png"), shouldImport: values.import };
}

function checkAtlas(nativeImage, path, shouldImport) {
  const metadata = readFileSync(join(cat, "atlas.template.json"));
  const { frameWidth, frameHeight, anchorX, anchorY, clips } = JSON.parse(metadata);
  const rows = Object.entries(clips);
  const width = frameWidth * 8;
  const height = frameHeight * rows.length;
  const png = readAtlasPng(path, width, height);
  const bitmap = nativeImage.createFromBuffer(png, { scaleFactor: 1 });
  const size = bitmap.getSize(1);
  if (size.width !== width || size.height !== height) throw new Error("Could not decode the PNG at its declared dimensions.");
  const pixels = bitmap.toBitmap({ scaleFactor: 1 });
  if (pixels.length !== width * height * 4) throw new Error("Decoded PNG did not have the expected four bytes per pixel.");

  const problems = [];
  for (const [row, [name, { frames }]] of rows.entries()) {
    for (let column = 0; column < 8; column++) {
      const cell = `row ${row + 1} (${name}), column ${column + 1}`;
      let hasArt = false;
      let hasTransparent = false;
      let hasEdge = false;
      for (let y = 0; y < frameHeight; y++) {
        for (let x = 0; x < frameWidth; x++) {
          const i = ((row * frameHeight + y) * width + column * frameWidth + x) * 4;
          // Electron's Windows bitmap is BGRA. Only the alpha byte matters here.
          if (pixels[i + 3] === 0) { hasTransparent = true; continue; }
          hasArt = true;
          if (x === 0 || x === frameWidth - 1 || y === 0 || y === frameHeight - 1) hasEdge = true;
        }
      }
      if (column >= frames) {
        if (hasArt) problems.push(`${cell} must be fully transparent.`);
      } else if (!hasArt) problems.push(`${cell} is empty and needs artwork.`);
      else if (!hasTransparent) problems.push(`${cell} has no transparent background pixels.`);
      else if (hasEdge) console.warn(`Visible pixels touch a frame edge in ${cell}. Check for clipping or spill.`);
    }
  }
  if (problems.length) throw new Error(problems.join("\n"));
  const frameCount = rows.reduce((total, [, clip]) => total + clip.frames, 0);
  console.log(`Cat sheet passed the pixel checks (${width}x${height}, ${frameCount} active frames). Visually confirm pose order, mirroring and the (${anchorX}, ${anchorY}) anchor.`);
  if (shouldImport) {
    importAtlas(png, metadata);
    console.log("Prepared assets/mascots/cat/sprites.png and atlas.json for local integration.");
  }
}

function readAtlasPng(path, width, height) {
  const handle = openSync(path, "r");
  try {
    const file = fstatSync(handle);
    if (!file.isFile() || file.size > 12 * 1024 * 1024) throw new Error("Choose a PNG file no larger than 12 MiB.");
    const png = Buffer.alloc(file.size);
    let offset = 0;
    while (offset < png.length) {
      const count = readSync(handle, png, offset, png.length - offset, null);
      if (!count) throw new Error("The PNG changed while it was being read.");
      offset += count;
    }
    if (png.length < 33 || png.subarray(0, 16).toString("hex") !== "89504e470d0a1a0a0000000d49484452") {
      throw new Error("The file does not have a PNG IHDR header.");
    }
    if (png[24] !== 8 || png[25] !== 6) throw new Error(`Export an 8-bit RGBA PNG. Found bit depth ${png[24]} and PNG color type ${png[25]}.`);
    const actualWidth = png.readUInt32BE(16);
    const actualHeight = png.readUInt32BE(20);
    if (actualWidth !== width || actualHeight !== height) {
      throw new Error(`Found ${actualWidth}x${actualHeight}. Expected ${width}x${height} for eight columns and ten 128x128 rows. Repack individual frames onto the grid.`);
    }
    return png;
  } finally { closeSync(handle); }
}

function importAtlas(png, metadata) {
  const created = [];
  try {
    for (const [name, payload] of [["sprites.png", png], ["atlas.json", metadata]]) {
      const path = join(cat, name);
      const handle = openSync(path, "wx");
      created.push(path);
      try { writeFileSync(handle, payload); } finally { closeSync(handle); }
    }
  } catch (error) {
    for (const path of created) unlinkSync(path);
    if (error.code === "EEXIST") throw new Error("An import already exists. Move the existing sprites.png and atlas.json aside first.");
    throw error;
  }
}
