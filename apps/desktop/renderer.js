const pose = document.querySelector("#pose");
window.pawmetry.onView(({ pet, paused, reduced, mode, quota, resets }) => {
  document.body.dataset.pose = pet.pose;
  document.body.dataset.moving = String(pet.speed > 0 && !paused && !reduced);
  document.body.style.setProperty("--pace", Math.round(550 / Math.max(0.15, pet.speed)) + "ms");
  pose.textContent = pet.pose.charAt(0).toUpperCase() + pet.pose.slice(1);
  const label = mode === "simulation" ? "Simulation" : quota === "fresh" ? "Live Codex" : "Codex · " + quota;
  document.querySelector("#mode").textContent = label;
  for (const metric of ["energy", "stamina"]) {
    const value = pet[metric];
    const meter = document.querySelector("#" + metric);
    meter.hidden = value === null;
    meter.value = value ?? 0;
    document.querySelector("#" + metric + "-text").textContent = value === null ? "Unknown" : value + "%";
    document.querySelector("#" + metric + "-reset").textContent = resets[metric] ?? "";
  }
});
