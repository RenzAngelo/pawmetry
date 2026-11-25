const api = window.pawmetrySettings;
const byId = (id) => document.getElementById(id);
const put = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const fields = new Map();
const upper = (value) => value[0].toUpperCase() + value.slice(1);
const displayModes = [["pet", "Pet only"], ["compact", "Compact"], ["dashboard", "Dashboard"]];
const sizes = ["small", "standard", "large"].map((value) => [value, upper(value)]);
const pct = (values) => values.map((value) => [value, (value * 100) + "%"]);
const alertMode = ["off", "silent", "sound"].map((value) => [value, upper(value)]);
let snapshot;
let updating = false;

function options(input, choices) {
  input.replaceChildren(...choices.map(([, text], index) => new Option(text, String(index))));
}

function field(group, key, title, choices) {
  const wrapper = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = title;
  const input = document.createElement(choices ? "select" : "input");
  input.id = "setting-" + key;
  const row = { input, choices };
  if (choices) options(input, choices);
  else { input.type = "checkbox"; wrapper.classList.add("check"); }
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

const appearance = "appearance-fields";
field(appearance, "mode", "Display mode", displayModes);
field(appearance, "windowSize", "Window size", sizes);
field(appearance, "petSize", "Pet size", sizes);
field(appearance, "backgroundOpacity", "Background opacity", pct([0, 0.5, 0.8, 1]));
field(appearance, "petOpacity", "Pet opacity", pct([0.5, 0.75, 1]));
field(appearance, "speed", "Animation speed", [0.5, 1, 1.5, 2].map((value) => [value, value + "×"]));
field(appearance, "monitor", "Monitor", [[null, "Follow the pet"]]);
field(appearance, "shortcut", "Global show/hide shortcut", [[null, "Off"],
  ["CommandOrControl+Alt+Shift+P", "Ctrl+Alt+Shift+P"], ["CommandOrControl+Alt+Shift+F10", "Ctrl+Alt+Shift+F10"]]);
for (const [key, title] of [["alwaysOnTop", "Always on top"], ["clickThrough", "Click-through"], ["reducedMotion", "Reduced motion"],
  ["energyBar", "Energy bar"], ["staminaBar", "Stamina bar"], ["hoverInfo", "Show information on hover"], ["roaming", "Roam within the window"]]) {
  field(appearance, key, title);
}
const notifications = "notification-fields";
for (const [key, title] of [["lowEnergy", "Low energy"], ["lowStamina", "Low stamina"], ["restoredEnergy", "Energy restored"],
  ["restoredStamina", "Stamina restored"], ["exhaustion", "Allowance at zero"]]) field(notifications, "alert-" + key, title, alertMode);
for (const meter of ["energy", "stamina"]) {
  field(notifications, meter + "Threshold", upper(meter) + " threshold", [10, 20, 30, 40, 50].map((value) => [value, value + "%"]));
}
field(notifications, "quietHours", "Quiet hours (10 pm to 7 am)");

const activityLabels = {
  unconfigured: ["Activity monitoring not configured", "Create disposable workspaces to test the native Codex hook connection."],
  starting: ["Preparing disposable workspaces", "Pawmetry is starting the local activity receiver."],
  stopping: ["Disconnecting activity", "Pawmetry is removing its unchanged disposable hook files."],
  review: ["Native hook approval required", "The receiver is waiting for its first event. Use native Codex review to confirm approval. Approved hooks may still be waiting for an observable event."],
  working: ["Activity monitoring connected", "Model or tool work was observed in an enrolled workspace."],
  "no-active-sessions": ["Activity monitoring connected", "No observable active sessions. Idle status and task outcome are unknown."],
  interrupted: ["Activity monitoring connected", "Codex reported an interruption in an observed session."],
  stale: ["Activity data is stale", "An earlier observation expired. Current work is unknown until another event arrives."],
  disconnected: ["Observed sessions disconnected", "Codex reported session closure. A new session or resume may reconnect."],
  paused: ["Activity monitoring paused", "Resume monitoring to accept new events."],
};

function workspaces(rows) {
  const layout = byId("workspaces");
  if (layout.children.length !== rows.length || rows.some(({ path }, index) => layout.children[index]?.querySelector("input").value !== path)) {
    layout.replaceChildren(...rows.map(({ label, path }) => {
      const row = document.createElement("div");
      row.className = "workspace";
      const title = document.createElement("strong");
      title.textContent = "Workspace " + label;
      const pathRow = document.createElement("div");
      pathRow.className = "path";
      const input = document.createElement("input");
      input.readOnly = true;
      input.value = path;
      input.setAttribute("aria-label", title.textContent + " folder path");
      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "Copy path";
      copy.addEventListener("click", async () => { await action("copy-" + label); put(byId("settings-error"), "Workspace " + label + " folder path copied."); });
      pathRow.append(input, copy);
      row.append(title, pathRow, document.createElement("p"));
      return row;
    }));
  }
  rows.forEach(({ last, states, seen, configuration }, index) => {
    const config = { present: "Hook file matches", changed: "Hook file changed", missing: "Hook file missing", unavailable: "Hook file unreadable" }[configuration] ?? "Hook file unchecked";
    const evidence = !last ? (seen ? "Waiting for a new event" : "No events received")
      : states.includes("working") ? "Working observed" : states.includes("interrupted") ? "Interruption observed"
      : states.length && states.every((state) => state === "disconnected") ? "Session closure observed"
      : states.length === 0 || states.includes("stale") ? "Stale · current state unknown" : "Outcome unknown";
    const timestamp = last ? ` · Last ${last.event.replaceAll("-", " ")} at ${new Date(last.at).toLocaleTimeString()}` : "";
    put(layout.children[index].querySelector("p"), [config, evidence].join(" · ") + timestamp);
  });
}

function render(view) {
  if (!view) return;
  snapshot = view;
  updating = true;
  const { preferences, activity } = view;
  const displayChoices = [[null, "Follow the pet"], ...view.displays.map(({ id, label }) => [id, label])];
  const monitor = fields.get("monitor");
  if (JSON.stringify(monitor.choices) !== JSON.stringify(displayChoices)) { monitor.choices = displayChoices; options(monitor.input, displayChoices); }
  const values = { ...preferences, windowSize: preferences.windowSizes[preferences.mode], energyThreshold: preferences.lowThresholds.energy,
    staminaThreshold: preferences.lowThresholds.stamina };
  for (const [key, { input, choices }] of fields) {
    const value = key.startsWith("alert-") ? preferences.alerts[key.slice(6)] : values[key];
    if (choices) {
      const index = choices.findIndex(([item]) => item === value);
      if (index >= 0) input.value = String(index);
    } else input.checked = value;
  }
  updating = false;
  const quota = { fresh: "Live quota connected", loading: "Connecting to live quota", stale: "Live quota data is stale",
    paused: "Live quota paused", unavailable: "Live quota unavailable", offline: "Simulation quota" };
  put(byId("quota-state"), quota[view.quota]);
  put(byId("toggle-quota"), view.liveSelected ? "Disable live quota" : "Enable live quota");
  put(byId("toggle-monitoring"), view.monitoringPaused ? "Resume monitoring" : "Pause monitoring");
  const [label, detail] = activity.available ? activityLabels[activity.state] : ["Activity unsupported on this platform", "Disposable activity setup currently requires Windows."];
  put(byId("activity-state"), label);
  put(byId("activity-detail"), detail);
  put(byId("activity-issue"), activity.issue);
  put(byId("retained-paths"), activity.retainedPaths.join(" · "));
  const prepared = activity.workspaces.length > 0;
  byId("workspace-instructions").hidden = !prepared;
  byId("check-hooks").hidden = byId("stop-activity").hidden = !prepared;
  byId("start-activity").hidden = prepared || !activity.available;
  byId("start-activity").disabled = activity.state === "starting" || activity.state === "stopping";
  byId("startup").hidden = !view.canSetStartup;
  workspaces(activity.workspaces);
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
byId("toggle-quota").addEventListener("click", () => { if (snapshot) void action(snapshot.liveSelected ? "simulate-quota" : "live-quota"); });
byId("toggle-monitoring").addEventListener("click", () => { if (snapshot) void action(snapshot.monitoringPaused ? "resume-monitoring" : "pause-monitoring"); });
api.onView(render);
void read();
