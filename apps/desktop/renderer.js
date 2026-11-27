const pose = document.querySelector("#pose");
const spriteBox = document.querySelector(".cat-sprite");
const spriteImage = spriteBox.querySelector("img");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let spriteView;
let spriteReady = false;
let attemptedSprite = false;
let clipKey;
let playback;

function showClip({ row, frames, durationMs, loop, frozen }) {
  playback?.cancel();
  const transform = (column) => `translate(${-column * 12.5}%, ${-row * 10}%)`;
  spriteImage.style.transform = transform(0);
  if (frozen || frames === 1) return null;
  const keyframes = Array.from({ length: frames + 1 }, (_, i) => ({
    transform: transform(i < frames ? i : loop ? 0 : frames - 1), easing: "steps(1, end)",
  }));
  return spriteImage.animate(keyframes, { duration: durationMs, iterations: loop ? Infinity : 1, fill: "forwards" });
}

function renderSprite() {
  if (!spriteView || !spriteReady) return;
  const { sprite, motion } = spriteView;
  const frozen = motion.frozen || reduced.matches;
  const next = `${motion.motion}:${motion.durationMs}:${frozen}`;
  if (next === clipKey) return;
  clipKey = next;
  playback = showClip({ ...motion, row: sprite.row, frozen });
  if (playback && !motion.loop) playback.onfinish = () => {
    playback = showClip({ ...sprite.idle, loop: true, frozen });
  };
}

spriteImage.addEventListener("load", () => {
  spriteReady = spriteImage.naturalWidth === 1024 && spriteImage.naturalHeight === 1280;
  spriteBox.hidden = !spriteReady;
  if (spriteReady) document.body.dataset.mascot = "cat";
  renderSprite();
});
reduced.addEventListener("change", renderSprite);
const put = (element, text) => { if (element.textContent !== text) element.textContent = text; };
const commands = Object.fromEntries([...document.querySelectorAll("[data-command]")].map((button) => [button.dataset.command, button]));
let viewport = "";
function reportViewport() {
  const current = `${innerWidth}:${innerHeight}`;
  if (current === viewport) return;
  viewport = current;
  window.pawmetry.reportViewport(innerWidth, innerHeight);
}
window.addEventListener("resize", reportViewport);
window.pawmetry.onViewportRequest(() => { viewport = ""; reportViewport(); });
reportViewport();
for (const [command, button] of Object.entries(commands)) {
  button.addEventListener("click", () => { void window.pawmetry.command(command).catch(() => {}); });
}
for (const handle of document.querySelectorAll(".drag-bar, .pet-position")) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !event.isPrimary ||
        (handle.classList.contains("pet-position") && document.body.dataset.layout !== "pet")) return;
    handle.setPointerCapture(event.pointerId);
    window.pawmetry.drag("start", event.screenX, event.screenY);
  });
  handle.addEventListener("pointermove", (event) => {
    if (handle.hasPointerCapture(event.pointerId)) window.pawmetry.drag("move", event.screenX, event.screenY);
  });
  handle.addEventListener("lostpointercapture", () => window.pawmetry.drag("end"));
}
window.pawmetry.onFocusOptions(() => commands.more.focus());
commands.more.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") { event.preventDefault(); commands.more.click(); }
});
window.pawmetry.onView(({ pet, motion, sprite, mode, quota, resets, presentation }) => {
  reportViewport();
  document.documentElement.dataset.theme = presentation.theme;
  document.documentElement.dataset.reducedMotion = String(presentation.reducedMotion);
  document.body.dataset.pose = pet.pose;
  document.body.dataset.motion = motion.motion;
  document.body.dataset.moving = String(!motion.frozen);
  document.body.dataset.layout = presentation.mode;
  document.body.dataset.hoverInfo = String(presentation.hover);
  document.body.dataset.hovered = String(presentation.hovered);
  document.body.dataset.roaming = String(presentation.roaming);
  document.body.dataset.lowEnergy = String([pet.energy, pet.stamina].some((value) => value !== null && value <= 20));
  document.body.style.setProperty("--pace", motion.durationMs + "ms");
  document.body.style.setProperty("--frames", motion.frames);
  document.body.style.setProperty("--sprite-width", motion.width + "px");
  document.body.style.setProperty("--sprite-height", motion.height + "px");
  document.body.style.setProperty("--loops", motion.loop ? "infinite" : "1");
  document.body.style.setProperty("--card-alpha", presentation.background);
  document.body.style.setProperty("--pet-alpha", presentation.opacity);
  document.body.style.setProperty("--roam-pace", `${Math.max(900, motion.durationMs * 4)}ms`);
  if (sprite) {
    document.body.style.setProperty("--mascot-size", `${sprite.size}px`);
    spriteView = { sprite, motion };
    if (!attemptedSprite) {
      attemptedSprite = true;
      spriteImage.src = "../../assets/mascots/cat/sprites.png";
    }
    renderSprite();
  }
  const poseLabel = pet.pose.charAt(0).toUpperCase() + pet.pose.slice(1);
  put(pose, mode === "live" ? `${poseLabel} · Quota only` : poseLabel);
  pose.title = mode === "live" ? "Pawmetry reacts to account quota in this preview. Prompt activity is experimental." : "";
  const label = presentation.quotaOff ? "Live quota off" : presentation.monitoringPaused ? "Monitoring paused"
    : mode === "simulation" ? "Simulation" : quota === "loading" ? "Connecting to Codex"
    : quota === "fresh" ? "Live Codex" : "Codex · " + quota;
  put(document.querySelector("#mode"), label);
  commands["toggle-top"].setAttribute("aria-pressed", String(presentation.alwaysOnTop));
  commands.more.setAttribute("aria-expanded", String(presentation.menuOpen));
  for (const metric of ["energy", "stamina"]) {
    const value = pet[metric];
    const meter = document.querySelector("#" + metric);
    document.querySelector("#" + metric + "-group").hidden = !presentation[metric];
    meter.hidden = value === null;
    meter.value = value ?? 0;
    put(document.querySelector("#" + metric + "-text"), value === null ? "Unknown" : value + "%");
    put(document.querySelector("#" + metric + "-reset"), resets[metric] ?? "");
  }
});
