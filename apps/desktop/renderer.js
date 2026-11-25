const pose = document.querySelector("#pose");
const put = (element, text) => { if (element.textContent !== text) element.textContent = text; };
window.pawmetry.onView(({ pet, motion, mode, quota, resets, notice, activity, observing, presentation }) => {
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
  put(pose, pet.pose.charAt(0).toUpperCase() + pet.pose.slice(1));
  const label = presentation.monitoringPaused ? "Monitoring paused" : mode === "simulation" ? "Quota simulation"
    : quota === "fresh" ? "Live Codex" : "Codex · " + quota;
  put(document.querySelector("#mode"), label);
  put(document.querySelector("#activity"), observing ? `Codex hooks · ${activity}` : "Codex activity · unknown");
  put(document.querySelector("#quota-notice"), notice);
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
