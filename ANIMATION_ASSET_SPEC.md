# Pawmetry mascot asset specification

Cat is the selected mascot. The local Cat review build loads the validated pair and retains the CSS placeholder as a fallback. [`validateAtlas`](packages/animation/sprite-atlas.ts) and [`spriteFrame`](packages/animation/sprite-atlas.ts) define the layout. [Cat artwork intake](assets/mascots/cat/README.md) covers source files, repacking, animation previews, and the isolated package.

## Canvas and atlas

- Export a single lossless RGBA `sprites.png` with a transparent background. Use an adjacent UTF-8 `atlas.json` with `schema`, `frameWidth`, `frameHeight`, `anchorX`, `anchorY`, `facing`, and `clips`. No remote assets, scripts, fonts, or other resources are part of the contract.
- Use **128 × 128 px per frame** for the approved mascot. The Cat review uses a 128 logical pixel canvas by default and fits the chosen 64–192 px size within the current window. Visible artwork occupies less than the canvas because transparent margins protect extended poses, props, and jumps. Keep each frame the same size and leave room for extreme poses. Avoid matte-colored edges. The underlying validator also supports integer cell sizes from 32 to 256 pixels.
- The sheet is eight columns wide. Every state occupies one row. Frame 0 is on the left. After the last frame leave the rest of the row fully transparent. Do not trim, rotate or pack cells. The standard right-facing sheet is **1,024 × 1,280 px**. A two-direction sheet is **1,024 × 2,560 px**, with the same row order repeated for authored left-facing frames below the right-facing rows.
- Pin all poses to **(64, 112)** from the top left, centered at the baseline between the feet. Align authored left frames to the same point. For `facing: "mirror"`, the frame calculation maps the horizontal anchor to `frameWidth - 1 - anchorX` (63 for this sheet). Use `facing: "dual"` when mirroring would reverse an important asymmetrical detail.

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

- Prioritize rows 0–5 and row 8. Row 3 covers tired movement, row 5 covers rest with explicit blocking evidence, and row 8 doubles as a one-shot wake or recharge when a fresh provider sample confirms restoration. In this preview the live API supplies no confirmed blocking signal, so only simulation can show quota-exhaustion sleep. Rows 6 and 7 remain reserved for later activity features. Sheet dimensions and metadata still include all ten rows.
- Keep energy, stamina, movement speed, and activity inputs independent. A verified working session keeps its working pose at low or zero quota. Low quota can soften movement or expressions. Waiting and celebration require evidence when using live activity. An unknown/disconnected indicator remains visible independently of the pet's motion and quota bars.
- Start a new clip at frame 0 on state change. Preserve the anchor when switching clip or direction. Loop locomotion while it is active, then return to the relevant idle or activity clip. Run celebration once per confirmed event, then return to the current state. Reduced motion and animation pause hold a still frame. The placeholder uses a subtle fallback loop after celebration. Roaming is currently within the companion window.
- Load only the two fixed file names from a trusted local bundle. The desktop checks file limits before decoding, requires an RGBA PNG, verifies decoded dimensions and validates clip metadata and the shared anchor. It falls back to the placeholder if validation fails. The local intake script also checks cell occupancy and transparency. Review pose order, direction and anchor alignment visually.
