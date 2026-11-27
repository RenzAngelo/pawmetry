const api = window.pawmetrySettings;
const byId = (id) => document.getElementById(id);
const put = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const fields = new Map();
const upper = (value) => value[0].toUpperCase() + value.slice(1);
const displayModes = [["pet", "Pet only"], ["compact", "Compact"], ["dashboard", "Dashboard"]];
const sizes = ["small", "standard", "large"].map((value) => [value, upper(value)]);
const pct = (values) => values.map((value) => [value, (value * 100) + "%"]);
let snapshot;
let updating = false;
const pages = [...document.querySelectorAll("main > section")];
const links = [...document.querySelectorAll("[data-section]")];

function options(input, choices) {
  input.replaceChildren(...choices.map(([, text], index) => new Option(text, String(index))));
}

function field(group, key, title, choices, slider = false) {
  const wrapper = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = title;
  const input = document.createElement(choices && !slider ? "select" : "input");
  input.id = "setting-" + key;
  const row = { input, choices, slider, caption };
  if (slider) {
    input.type = "range";
    input.min = "0";
    input.max = String(choices.length - 1);
    input.addEventListener("input", () => updateSlider(row));
  } else if (choices) options(input, choices);
  else { input.type = "checkbox"; input.setAttribute("role", "switch"); wrapper.classList.add("check"); }
  input.addEventListener("change", async () => {
    if (updating) return;
    try { put(byId("settings-error"), await api.update(key, choices ? row.choices[Number(input.value)][0] : input.checked)); }
    catch { put(byId("settings-error"), "The Settings command could not reach Pawmetry."); }
    await read();
  });
  wrapper.append(caption, input);
  byId(group).append(wrapper);
  fields.set(key, row);
}

function updateSlider({ input, choices, caption }) {
  const label = choices[Number(input.value)][1];
  input.setAttribute("aria-valuetext", label);
  input.title = label;
  if (input.id === "setting-mascotSize") put(caption, `Custom Cat size · ${label}`);
}

function showSection(name, moveFocus = false) {
  for (const page of pages) page.hidden = page.id !== name;
  for (const link of links) {
    if (!link.closest("nav")) continue;
    if (link.dataset.section === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  byId("content").scrollTop = 0;
  if (moveFocus) byId(name + "-title").focus();
}

const appearance = "appearance-fields";
field(appearance, "theme", "Theme", [["dark", "Dark"], ["light", "Light"], ["system", "Follow system"]]);
field(appearance, "mode", "Display mode", displayModes);
field(appearance, "windowSize", "Window size", sizes);
field(appearance, "petSize", "Pet size", sizes);
const mascotPresets = [[64, "64 px"], [96, "96 px"], [128, "128 px"], [192, "192 px"], [null, "Custom"]];
const mascotPreset = document.createElement("select");
mascotPreset.id = "setting-mascot-preset";
const mascotPresetRow = document.createElement("label");
const mascotPresetCaption = document.createElement("span");
mascotPresetCaption.textContent = "Cat size preset";
mascotPresetRow.append(mascotPresetCaption, mascotPreset);
options(mascotPreset, mascotPresets);
mascotPreset.lastElementChild.disabled = true;
byId(appearance).append(mascotPresetRow);
field(appearance, "mascotSize", "Custom Cat size", Array.from({ length: 129 }, (_, index) => [64 + index, `${64 + index} px`]), true);
const mascotSlider = fields.get("mascotSize").input;
const mascotHint = document.createElement("p");
mascotHint.textContent = "Cat scales down to fit smaller windows. Choose a larger window for more room.";
byId(appearance).append(mascotHint);
mascotPreset.addEventListener("change", async () => {
  try { put(byId("settings-error"), await api.update("mascotSize", mascotPresets[Number(mascotPreset.value)][0])); }
  catch { put(byId("settings-error"), "The Settings command could not reach Pawmetry."); }
  await read();
});
field(appearance, "backgroundOpacity", "Background opacity", pct([0, 0.5, 0.8, 1]), true);
field(appearance, "petOpacity", "Pet opacity", pct([0.5, 0.75, 1]), true);
field("behavior-fields", "speed", "Animation speed", [0.5, 1, 1.5, 2].map((value) => [value, value + "×"]), true);
field("general-fields", "monitor", "Monitor", [[null, "Follow the pet"]]);
field("shortcut-fields", "shortcut", "Global show/hide shortcut", [[null, "Off"],
  ["CommandOrControl+Alt+Shift+P", "Ctrl+Alt+Shift+P"], ["CommandOrControl+Alt+Shift+F10", "Ctrl+Alt+Shift+F10"]]);
for (const [group, key, title] of [["general-fields", "alwaysOnTop", "Always on top"], ["general-fields", "clickThrough", "Click-through"],
  ["behavior-fields", "reducedMotion", "Reduced motion"], [appearance, "energyBar", "Energy bar"], [appearance, "staminaBar", "Stamina bar"],
  [appearance, "hoverInfo", "Show information on hover"], ["behavior-fields", "roaming", "Roam within the window"]]) {
  field(group, key, title);
}
function render(view) {
  if (!view) return;
  snapshot = view;
  updating = true;
  const { preferences } = view;
  fields.get("petSize").input.closest("label").hidden = view.cat;
  mascotPresetRow.hidden = mascotSlider.closest("label").hidden = mascotHint.hidden = !view.cat;
  const mascotPresetIndex = mascotPresets.findIndex(([value]) => value === preferences.mascotSize);
  mascotPreset.value = String(mascotPresetIndex === -1 ? mascotPresets.length - 1 : mascotPresetIndex);
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.dataset.reducedMotion = String(preferences.reducedMotion);
  const displayChoices = [[null, "Follow the pet"], ...view.displays.map(({ id, label }) => [id, label])];
  const monitor = fields.get("monitor");
  if (JSON.stringify(monitor.choices) !== JSON.stringify(displayChoices)) { monitor.choices = displayChoices; options(monitor.input, displayChoices); }
  const values = { ...preferences, windowSize: preferences.windowSizes[preferences.mode] };
  for (const [key, row] of fields) {
    const { input, choices } = row;
    const value = values[key];
    if (choices) {
      if (row.slider && input.matches(":active")) continue;
      const index = choices.findIndex(([item]) => item === value);
      if (index >= 0 && input.value !== String(index)) input.value = String(index);
      if (row.slider) updateSlider(row);
    } else input.checked = value;
  }
  updating = false;
  const quota = { fresh: "Live quota connected", loading: "Connecting to live quota", stale: "Live quota data is stale",
    paused: "Live quota paused", unavailable: "Live quota unavailable", offline: "Simulation quota" };
  put(byId("quota-state"), view.bundledQuota && !view.liveSelected ? "Live quota off" : quota[view.quota]);
  put(byId("toggle-quota"), view.liveSelected ? "Turn off quota access" : "Connect to Codex quota");
  put(byId("quota-details"), view.bundledQuota
    ? "Pawmetry reads your remaining allowance and reset times. Turning access off stops quota requests until you connect again."
    : "Show energy, stamina and reset times for your Codex account.");
  put(byId("toggle-monitoring"), view.monitoringPaused ? "Resume monitoring" : "Pause monitoring");
  put(byId("build-info"), view.buildInfo);
  put(byId("build-executable"), view.executable ?? "");
  const install = { unchecked: "Check whether the local VS Code Codex extension is installed.",
    checking: "Looking for Codex…", found: "Local Codex installation found.",
    missing: "Codex could not be found. Install the OpenAI Codex extension in local VS Code and sign in there.",
    ambiguous: "More than one Codex installation was found. Pawmetry needs one unambiguous supported installation.",
    unsupported: "This preview supports the local Windows x64 VS Code Codex extension." };
  put(byId("codex-install"), install[view.codexInstall.status] ?? "Codex could not be found.");
  document.querySelector('[data-action="refresh"]').disabled = !view.liveSelected || view.monitoringPaused;
}

async function read() {
  try {
    const view = await api.read();
    if (!view) throw new Error("Settings unavailable");
    render(view);
  } catch { put(byId("settings-error"), "Settings could not connect to the Pawmetry desktop process."); }
}
async function action(name) {
  try { render(await api.action(name)); } catch { put(byId("settings-error"), "The Settings command could not reach Pawmetry."); }
}
for (const button of document.querySelectorAll("[data-action]")) button.addEventListener("click", () => action(button.dataset.action));
for (const link of links) link.addEventListener("click", () => showSection(link.dataset.section, true));
byId("toggle-quota").addEventListener("click", () => { if (snapshot) void action(snapshot.liveSelected ? "disable-live-quota" : "live-quota"); });
byId("toggle-monitoring").addEventListener("click", () => { if (snapshot) void action(snapshot.monitoringPaused ? "resume-monitoring" : "pause-monitoring"); });
api.onView(render);
showSection("general");
void read();
