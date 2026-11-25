# Pawmetry mascot asset specification

Artwork is supplied and approved separately. The desktop continues using its CSS placeholder. [`validateAtlas`](packages/animation/sprite-atlas.ts) and [`spriteFrame`](packages/animation/sprite-atlas.ts) define and test the layout using synthetic metadata.

## Canvas and atlas

- Export a single lossless RGBA `sprites.png` with a transparent background. Use an adjacent UTF-8 `atlas.json` with `schema`, `frameWidth`, `frameHeight`, `anchorX`, `anchorY`, `facing`, and `clips`. No remote assets, scripts, fonts, or other resources are part of the contract.
- Draw on **128 × 128 px per frame**. The prototype targets roughly 64–96 logical display pixels. Keep each frame the same size and leave room for effects and extreme poses. Avoid matte-colored edges. The validator accepts integer cell dimensions from 32 to 256 pixels.
- The sheet is eight columns wide. Every state occupies one row. Frame 0 is on the left. After the last frame leave the rest of the row fully transparent. Do not trim, rotate or pack cells. The standard right-facing sheet is **1,024 × 1,280 px**. A two-direction sheet is **1,024 × 2,560 px**, with the same row order repeated for authored left-facing frames below the right-facing rows.
- Pin all poses to one frame-relative integer anchor. Suggested anchor is **(64, 112)** from the top left, centered at the baseline between the feet. Align the same point in authored left frames. For `facing: "mirror"`, the renderer flips the right-facing frame and maps horizontal anchor to `frameWidth - 1 - anchorX`. Use `facing: "dual"` for asymmetrical artwork.

## Rows and timing

Each `clips` entry has `frames`, `fps`, and `loop`. The table gives the recommended values. The validation bounds are 1–8 whole frames and 1–30 frames per second. Each state uses the same frame dimensions.

| Row (zero-based) | State key | Frames | Frames per second | Repeat |
| --- | --- | ---: | ---: | --- |
| 0 | `idle` | 4 | 4 | Loop |
| 1 | `walking` | 6 | 8 | Loop |
| 2 | `running` | 8 | 14 | Loop |
| 3 | `slow-walking` | 4 | 5 | Loop |
| 4 | `exhaustion` | 4 | 3 | Loop |
| 5 | `sleeping` | 2 | 2 | Loop |
| 6 | `working` | 6 | 10 | Loop |
| 7 | `waiting` | 4 | 5 | Loop |
| 8 | `celebration` | 8 | 12 | One shot |
| 9 | `unknown` | 4 | 3 | Loop |

## Presentation and validation

- Keep energy, stamina, movement speed, and activity inputs independent. A verified working session keeps its working pose at low or zero quota. Low quota can soften movement or expressions. Waiting and celebration require evidence when using live activity. An unknown/disconnected indicator remains visible independently of the pet's motion and quota bars.
- Start a new clip at frame 0 on state change. Preserve the anchor when switching clip or direction. Loop locomotion while it is active, then return to the relevant idle or activity clip. Run celebration once per confirmed event, then return to the current state. Reduced motion and animation pause hold a still frame. The placeholder uses a subtle fallback loop after celebration. Roaming is currently within the companion window.
- When wiring the approved asset, load only those two fixed file names from a trusted local bundle. Check file limits before decoding, require a supported RGBA PNG, verify decoded image dimensions against the atlas, and reject missing state keys, invalid frame counts, timing, direction, or anchors. Fall back to the placeholder if validation fails. The current validator checks metadata and decoded dimensions. PNG decoding, transparency/anchor visual inspection, real asset loading and artwork QA are still pending.
