const pose = document.querySelector("#pose");
window.pawmetry.onView(({ pet, motion, mode, quota, resets, notice }) => {
  document.body.dataset.pose = pet.pose;
  document.body.dataset.motion = motion.motion;
  document.body.dataset.moving = String(!motion.frozen);
  document.body.style.setProperty("--pace", motion.durationMs + "ms");
  document.body.style.setProperty("--frames", motion.frames);
  document.body.style.setProperty("--sprite-width", motion.width + "px");
  document.body.style.setProperty("--sprite-height", motion.height + "px");
  document.body.style.setProperty("--loops", motion.loop ? "infinite" : "1");
  pose.textContent = pet.pose.charAt(0).toUpperCase() + pet.pose.slice(1);
  const label = mode === "simulation" ? "Simulation" : quota === "fresh" ? "Live Codex" : "Codex · " + quota;
  document.querySelector("#mode").textContent = label;
  const alert = document.querySelector("#quota-notice");
  if (alert.textContent !== notice) alert.textContent = notice;
  for (const metric of ["energy", "stamina"]) {
    const value = pet[metric];
    const meter = document.querySelector("#" + metric);
    meter.hidden = value === null;
    meter.value = value ?? 0;
    document.querySelector("#" + metric + "-text").textContent = value === null ? "Unknown" : value + "%";
    document.querySelector("#" + metric + "-reset").textContent = resets[metric] ?? "";
  }
});
