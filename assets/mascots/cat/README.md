# Cat artwork intake

## Local review build

The recovered Cat atlas contains the 50 poses from the supplied draft. The extraction script uses measured row and column guides for that exact source, a common nearest-neighbor scale, and individual body centers. It aligns the ground at `(64, 112)` and keeps a fixed ground line for running and celebration. It removes pixels outside each pose's crop, low-alpha debris, and detached flecks above two laptop poses. The original reference and draft remain in their intake locations.

```powershell
npm.cmd run mascot:repack
npm.cmd run mascot:check -- assets/mascots/cat/drafts/Cat-repacked.png --import
npm.cmd run mascot:preview
npm.cmd run package:cat-review
```

The first two commands refuse to overwrite prior outputs. If the processed pair already exists, start with `mascot:preview` or `package:cat-review`. Open `assets/mascots/cat/review/index.html` to play or pause all ten clips and compare the 50-frame contact sheet at 64, 80, or 96 pixels, with optional mirroring and a ground guide. Extract the `*-cat-review.zip` and run `Pawmetry.exe` normally. Close any other Pawmetry instance first so the existing single-companion lock can hand control to the review build. The review build has a separate preferences folder. Use the tray's **Next scenario** to exercise simulated quota animations. Regular packaging excludes the Cat files.

The reference and atlas came from the maintainer's prior ChatGPT Web artwork workflow. This pass used local extraction, cleanup and repacking of those files. Record the source history, confirm the rights to distribute derivative artwork, and review the working name before public distribution. The local review ZIP is unsigned. The working and waiting clips can be reviewed in the preview page. Live Codex activity remains a separate experiment. The unknown row retains the draft's crossed-out visor, which can read as disconnected. Several walking, tired and working frames have similar silhouettes, so their loops are stylized and subtle at small sizes.

Drag anywhere in the top row with the dotted grip and **Pawmetry** title in compact or dashboard mode. In pet-only mode, drag the mascot itself. If click-through is enabled, use **Show or hide pet** from the tray to restore window input.

| File | Project path |
| --- | --- |
| Master reference for artists | `assets/mascots/cat/reference/Cat-reference.png` |
| Draft or replacement atlas | `assets/mascots/cat/drafts/Cat-atlas.png` |
| Validated runtime pair for later integration | `assets/mascots/cat/sprites.png` and `assets/mascots/cat/atlas.json` |

The reference, draft, and review outputs stay local. The approved runtime pair is tracked so others can reproduce the Cat build from source. See the [artwork terms](DISTRIBUTION.md) and the [animation asset specification](../../../ANIMATION_ASSET_SPEC.md).

## Current draft

The supplied draft is an 8-bit RGBA PNG at **1122 × 1402 px**. The visible poses follow the expected order and counts, from top to bottom. Idle 4, walking 6, running 8, slow-walking 4, exhaustion 4, sleeping 2, working 6, waiting 4, celebration 8, and unknown 4. The intended grid has eight columns and ten rows. This image cannot be sliced into eighty 128 × 128 cells as delivered. Its unused areas are mostly clear, but even a proportional grid picks up visible pixels in unused cells, including idle column 5 and working column 7 (counted from 1). Edges of poses and effects cross multiple cell boundaries. Consistent `(64, 112)` anchoring cannot be confirmed on this layout.

Repack each pose into its own transparent **128 × 128 px** cell on a **1024 × 1280 px** canvas. Use cell origins at `(128 × column, 128 × row)` with zero-based indices. Preserve the pose order above and fill cells from the left. Place the character pivot at `(64, 112)` relative to the cell, using a shared ground baseline. Keep that baseline fixed during jumps so only the drawn pose moves. Keep shadows, glow and props inside their own cells. Clear all pixels after the last used frame in each row to alpha 0. Review a mirrored preview, especially if a prop or asymmetrical marking needs a specific orientation. Export an 8-bit RGBA PNG.

## Check and prepare a replacement

Run from the repository root on Windows. The check uses the existing development Electron dependency. Pass a PNG path after `--` to check a different file without copying it first.

```powershell
npm.cmd run mascot:check
```

The check rejects the wrong PNG format or dimensions, missing active frames, cells without transparent background pixels, and any visible pixels in unused cells. Edge warnings identify cells worth checking for spill or clipping. The check cannot recognize poses or verify the intended anchor by looking at pixels. Review those visually before importing.

```powershell
npm.cmd run mascot:check -- --import
```

After the pixel checks pass, `--import` copies the selected PNG and writes `atlas.json` from [`atlas.template.json`](atlas.template.json). It fails if either destination already exists. The intake supports the ten-row mirrored sheet. The Cat review build uses the imported pair and falls back to the placeholder if the files are missing or malformed.
