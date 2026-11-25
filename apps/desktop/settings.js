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
const pages = [...document.querySelectorAll("main > section")];
const links = [...document.querySelectorAll("[data-section]")];
let setupStep = "install";

function options(input, choices) {
  input.replaceChildren(...choices.map(([, text], index) => new Option(text, String(index))));
}

function field(group, key, title, choices, slider = false) {
  const wrapper = document.createElement("label");
  const caption = document.createElement("span");
  caption.textContent = title;
  const input = document.createElement(choices && !slider ? "select" : "input");
  input.id = "setting-" + key;
  const row = { input, choices, slider };
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

function updateSlider({ input, choices }) {
  input.setAttribute("aria-valuetext", choices[Number(input.value)][1]);
  input.title = input.getAttribute("aria-valuetext");
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

function showSetupStep(step) {
  setupStep = step;
  for (const entry of document.querySelectorAll("[data-step]")) entry.hidden = entry.dataset.step !== step;
  if (snapshot) renderSetup(snapshot);
  document.querySelector(`[data-step="${step}"] h3`).tabIndex = -1;
  document.querySelector(`[data-step="${step}"] h3`).focus();
}

function renderSetup({ codexInstall, targets }) {
  const info = { unchecked: "Codex has not been checked.", checking: "Looking for local Codex…",
    found: `Found the local Windows VS Code Codex bundle (${codexInstall.version}).`,
    ambiguous: "Multiple Codex bundles were found. Pawmetry cannot identify which one VS Code is using.",
    missing: "No supported local VS Code Codex bundle was found in the default location.",
    unsupported: "Automatic detection is available for the local Windows x64 VS Code bundle." };
  put(byId("installed-codex"), info[codexInstall.status]);
  if (setupStep !== "review") return;
  const project = document.querySelector('[name="activity-scope"]:checked').value === "project";
  byId("preview-project").hidden = !project;
  put(byId("preview-path"), (project ? targets.project : targets.user) ?? (project ? "Choose a local project to preview its hook file." : "This profile path could not be determined safely."));
  put(byId("profile-note"), project ? "Scope: this selected project. Existing hooks would be preserved."
    : targets.customProfile ? "This preview uses CODEX_HOME from Pawmetry. Confirm that VS Code uses the same profile."
      : "Scope: the default local Codex profile. Confirm that VS Code uses this profile.");
}

const appearance = "appearance-fields";
field(appearance, "theme", "Theme", [["dark", "Dark"], ["light", "Light"], ["system", "Follow system"]]);
field(appearance, "mode", "Display mode", displayModes);
field(appearance, "windowSize", "Window size", sizes);
field(appearance, "petSize", "Pet size", sizes);
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
const notifications = "notification-fields";
for (const [key, title] of [["lowEnergy", "Low energy"], ["lowStamina", "Low stamina"], ["restoredEnergy", "Energy restored"],
  ["restoredStamina", "Stamina restored"], ["exhaustion", "Allowance at zero"]]) field(notifications, "alert-" + key, title, alertMode);
for (const meter of ["energy", "stamina"]) {
  field(notifications, meter + "Threshold", upper(meter) + " threshold", [10, 20, 30, 40, 50].map((value) => [value, value + "%"]));
}
field(notifications, "quietHours", "Quiet hours (10 pm to 7 am)");

const activityLabels = {
  unconfigured: ["Activity monitoring not configured", "Review whether to connect your local Codex profile or a single project."],
  starting: ["Preparing disposable workspaces", "Pawmetry is starting the local activity receiver."],
  stopping: ["Disconnecting activity", "Pawmetry is removing its unchanged disposable hook files."],
  review: ["Native approval not verified", "Codex loads project hooks only for trusted projects and skips unapproved hooks. Verify the two steps in native Codex even if the file and receiver checks pass."],
  working: ["Activity monitoring connected", "Model or tool work was observed in an enrolled workspace."],
  "no-active-sessions": ["Activity monitoring connected", "No observable active sessions. Idle status and task outcome are unknown."],
  interrupted: ["Activity monitoring connected", "Codex reported an interruption in an observed session."],
  stale: ["Activity data is stale", "An earlier observation expired. Current work is unknown until another event arrives."],
  disconnected: ["Observed sessions disconnected", "Codex reported session closure. A new session or resume may reconnect."],
  paused: ["Activity monitoring paused", "Resume monitoring to accept new events."],
};

function workspaces(rows, hasReviewCommand) {
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
      const launch = document.createElement("button");
      launch.type = "button";
      launch.textContent = "Open in VS Code";
      launch.addEventListener("click", () => action("open-" + label));
      const review = document.createElement("button");
      review.type = "button";
      review.dataset.review = "true";
      review.textContent = "Copy Codex review command";
      review.setAttribute("aria-describedby", "codex-review-status");
      review.addEventListener("click", async () => {
        await action("review-" + label);
        put(byId("settings-error"), "Paste the command into Windows PowerShell, then type /hooks inside Codex.");
      });
      const actions = document.createElement("div");
      actions.className = "actions";
      actions.append(launch, review);
      row.append(title, pathRow, actions, document.createElement("p"));
      return row;
    }));
  }
  rows.forEach(({ last, states, seen, configuration, transport, rejected }, index) => {
    const config = { present: "Hook file matches", changed: "Hook file changed", missing: "Hook file missing", unavailable: "Hook file unreadable" }[configuration] ?? "Hook file unchecked";
    const evidence = !last ? (seen ? "Waiting for a new event" : "No events received")
      : states.includes("working") ? "Working observed" : states.includes("interrupted") ? "Interruption observed"
      : states.length && states.every((state) => state === "disconnected") ? "Session closure observed"
      : states.length === 0 || states.includes("stale") ? "Stale · current state unknown" : "Outcome unknown";
    const timestamp = last ? ` · Last ${last.event.replaceAll("-", " ")} at ${new Date(last.at).toLocaleTimeString()}` : "";
    const result = { passed: "Synthetic delivery passed", "launch-failed": "Local hook launcher failed",
      "no-delivery": "Synthetic delivery failed", "receiver-unavailable": "Receiver unavailable",
      "invalid-configuration": "Saved hook differs from this run" }[transport];
    const input = { "wrong-workspace": "Hook ran outside this workspace", "unsupported-input": "Hook ran, but Codex supplied an unsupported event payload" }[rejected];
    layout.children[index].querySelector("[data-review]").disabled = !hasReviewCommand;
    put(layout.children[index].querySelector("p"), [config, result, input, evidence].filter(Boolean).join(" · ") + timestamp);
  });
}

function render(view) {
  if (!view) return;
  snapshot = view;
  updating = true;
  const { preferences, activity } = view;
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.dataset.reducedMotion = String(preferences.reducedMotion);
  renderSetup(view);
  const displayChoices = [[null, "Follow the pet"], ...view.displays.map(({ id, label }) => [id, label])];
  const monitor = fields.get("monitor");
  if (JSON.stringify(monitor.choices) !== JSON.stringify(displayChoices)) { monitor.choices = displayChoices; options(monitor.input, displayChoices); }
  const values = { ...preferences, windowSize: preferences.windowSizes[preferences.mode], energyThreshold: preferences.lowThresholds.energy,
    staminaThreshold: preferences.lowThresholds.stamina };
  for (const [key, row] of fields) {
    const { input, choices } = row;
    const value = key.startsWith("alert-") ? preferences.alerts[key.slice(6)] : values[key];
    if (choices) {
      const index = choices.findIndex(([item]) => item === value);
      if (index >= 0 && input.value !== String(index)) input.value = String(index);
      if (row.slider) updateSlider(row);
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
  put(byId("diagnostic-state"), label);
  put(byId("activity-detail"), detail);
  put(byId("activity-issue"), activity.issue);
  put(byId("diagnostic-issue"), activity.issue);
  put(byId("build-info"), view.buildInfo);
  put(byId("build-executable"), view.executable ?? "");
  put(byId("retained-paths"), activity.retainedPaths.join(" · "));
  const prepared = activity.workspaces.length > 0;
  byId("workspace-instructions").hidden = !prepared;
  byId("check-hooks").hidden = byId("stop-activity").hidden = !prepared;
  byId("check-hooks").disabled = activity.checking;
  byId("start-activity").hidden = prepared || !activity.available;
  byId("start-activity").disabled = activity.state === "starting" || activity.state === "stopping";
  byId("startup").hidden = !view.canSetStartup;
  byId("next-scenario").disabled = view.liveSelected || view.monitoringPaused;
  const needsCodex = prepared && !activity.hasReviewCommand;
  const discoveryStatus = view.codexInstall.status;
  const reviewStatus = {
    unchecked: "Pawmetry needs to find one supported local Codex executable before it can copy the review command.",
    checking: "Looking for the local Codex executable. The review buttons will become available when it is found.",
    missing: "Pawmetry could not find the Codex executable bundled with the local VS Code extension. Check that the OpenAI Codex extension is installed in this Windows VS Code profile, then try again.",
    ambiguous: "Pawmetry found multiple eligible Codex installations. Use the executable from the VS Code extension you are testing to open native review manually.",
    unsupported: "Automatic Codex detection here requires the local Windows x64 VS Code bundle.",
  }[discoveryStatus];
  const status = byId("codex-review-status");
  status.hidden = !needsCodex;
  put(status, needsCodex ? reviewStatus ?? "The local Codex executable is not ready. Find Codex again to retry." : "");
  const retry = byId("retry-codex-review");
  retry.hidden = !needsCodex || discoveryStatus === "unsupported";
  retry.disabled = discoveryStatus === "checking";
  workspaces(activity.workspaces, activity.hasReviewCommand);
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
for (const button of document.querySelectorAll("[data-go]")) button.addEventListener("click", () => showSetupStep(button.dataset.go));
byId("open-wizard").addEventListener("click", () => { byId("wizard").hidden = false; showSetupStep("install"); });
byId("close-wizard").addEventListener("click", () => { byId("wizard").hidden = true; byId("open-wizard").focus(); });
byId("toggle-quota").addEventListener("click", () => { if (snapshot) void action(snapshot.liveSelected ? "simulate-quota" : "live-quota"); });
byId("toggle-monitoring").addEventListener("click", () => { if (snapshot) void action(snapshot.monitoringPaused ? "resume-monitoring" : "pause-monitoring"); });
api.onView(render);
showSection("general");
void read();
