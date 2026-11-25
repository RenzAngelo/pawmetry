const entries = [...document.querySelectorAll("[data-command]")];
const entry = (action) => entries.find((button) => button.dataset.command === action);

function focus(button) {
  if (!button) return;
  for (const option of entries) option.tabIndex = option === button ? 0 : -1;
  button.focus();
}

for (const option of entries) {
  option.addEventListener("click", () => { void window.pawmetryMenu.command(option.dataset.command); });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" || event.key === "Tab") {
    event.preventDefault();
    void window.pawmetryMenu.command("close");
    return;
  }
  const enabled = entries.filter((option) => !option.disabled);
  const current = enabled.indexOf(document.activeElement);
  switch (event.key) {
    case "ArrowDown": focus(enabled[(current + 1) % enabled.length]); break;
    case "ArrowUp": focus(enabled[(current + enabled.length - 1) % enabled.length]); break;
    case "Home": focus(enabled[0]); break;
    case "End": focus(enabled.at(-1)); break;
    default: return;
  }
  event.preventDefault();
});

window.pawmetryMenu.onView(({ theme, mode, paused, monitoringPaused, refreshEnabled, clickThrough, reducedMotion }) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.reducedMotion = String(reducedMotion);
  for (const item of entries.filter((button) => button.getAttribute("role") === "menuitemradio")) {
    item.setAttribute("aria-checked", String(item.dataset.command === "mode-" + mode));
  }
  entry("toggle-animation").querySelector("span").textContent = paused ? "Resume animations" : "Pause animations";
  entry("toggle-animation").querySelector("i").className = paused ? "icon icon-play" : "icon icon-pause";
  entry("toggle-monitoring").querySelector("span").textContent = monitoringPaused ? "Resume monitoring" : "Pause monitoring";
  entry("refresh").disabled = !refreshEnabled;
  entry("toggle-click").setAttribute("aria-checked", String(clickThrough));
  focus(entries[0]);
});
