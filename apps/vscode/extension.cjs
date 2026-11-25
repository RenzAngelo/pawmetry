const vscode = require("vscode");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const packaged = join(__dirname, "shared");
const shared = existsSync(packaged) ? packaged : join(__dirname, "..", "..");
const bundled = (path) => import(pathToFileURL(join(shared, path)).href);

function activate(context) {
  const quota = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const activity = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  const connection = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
  let demo = null;
  let desktop = null;
  let reading = null;
  let operationId = 0;
  let disposed = false;
  let demoIndex = 0;
  let ask;
  let resetText;
  const changed = new vscode.EventEmitter();
  let rows = [];
  const controls = [
    ["Connect to companion", "connectDesktop"], ["Show companion", "showDesktop"], ["Hide companion", "hideDesktop"],
    ["Refresh quota", "refreshQuota"], ["Settings", "desktopSettings"], ["Pause animations", "pauseAnimations"],
    ["Resume animations", "resumeAnimations"], ["Pause monitoring", "pauseMonitoring"],
    ["Resume monitoring", "resumeMonitoring"], ["Exit companion", "exitCompanion"],
  ];
  const provider = { onDidChangeTreeData: changed.event, getTreeItem: (item) => item, getChildren(parent) {
    if (parent) return [];
    return [...rows.map((label) => new vscode.TreeItem(label)), ...controls.map(([label, command]) => {
      const item = new vscode.TreeItem(label);
      item.command = { command: `pawmetry.${command}`, title: label };
      return item;
    })];
  } };
  quota.name = "Pawmetry quota";
  quota.command = "pawmetry.refreshQuota";
  activity.name = "Pawmetry activity";
  connection.name = "Pawmetry desktop connection";
  connection.command = "pawmetry.connectDesktop";

  function render() {
    const percent = (value) => value === null || value === undefined ? "?" : value + "%";
    const now = Date.now();
    const valid = desktop?.quota === "fresh" && desktop.validUntil !== null && now < desktop.validUntil;
    const available = (slot) => valid && (desktop[slot].resetAt === null || desktop[slot].resetAt > now);
    const remaining = (slot) => available(slot) ? desktop[slot].remaining : null;
    const resetInfo = ["energy", "stamina"].flatMap((slot) => {
      const text = available(slot) ? resetText?.(desktop[slot].resetAt, now) : null;
      return text ? [`${slot} · ${text}`] : [];
    });
    const values = demo ? [demo.pet.energy, demo.pet.stamina] : [remaining("energy"), remaining("stamina")];
    quota.text = `${demo ? "Pawmetry Sim" : "Pawmetry"} · ${percent(values[0])} / ${percent(values[1])}`;
    quota.tooltip = demo ? "Simulated energy and stamina" :
      ["Codex energy and stamina from the desktop companion.", ...resetInfo].join("\n");
    activity.text = demo ? `Sim activity · ${demo.pet.pose}` : desktop?.activity && desktop.activity !== "unknown"
      ? `Observed activity · ${desktop.activity}` : "Activity · Unknown";
    activity.tooltip = demo ? "Offline demonstration"
      : "All enrolled disposable sessions observed by the companion. This window’s activity is unknown.";
    const health = desktop?.quota === "fresh" && !valid ? "stale" : desktop?.quota;
    connection.text = desktop ? "Pawmetry desktop · " + (desktop.mode === "simulation" ? "Simulation" : valid ? "Live" : "Quota " + health)
      : "Pawmetry desktop · Disconnected";
    connection.tooltip = desktop ? "Connected to the local desktop companion"
      : "Start the companion and enable live quota from its tray menu.";
    const next = [connection.text, quota.text, activity.text, ...resetInfo];
    if (next.length !== rows.length || next.some((line, i) => line !== rows[i])) {
      rows = next;
      changed.fire();
    }
  }

  async function exchange(op) {
    if (process.platform !== "win32" || vscode.env.remoteName || !vscode.workspace.isTrusted || disposed) return false;
    const id = ++operationId;
    try {
      if (!ask) {
        const [clientModule, dateModule] = await Promise.all([
          bundled("packages/ipc/client.ts"), bundled("packages/telemetry/time-display.ts"),
        ]);
        if (context.extensionMode === vscode.ExtensionMode.Test) {
          const namespace = process.env.PAWMETRY_IPC_TEST_NAMESPACE;
          if (namespace && /^[a-f0-9]{32}$/.test(namespace)) {
            const { windowsEndpoint } = await bundled("packages/ipc/discovery.ts");
            ask ??= clientModule.desktopClient(() => windowsEndpoint("read", undefined, namespace));
          } else {
            ask ??= async () => null;
          }
        } else {
          ask ??= clientModule.desktopClient();
        }
        resetText = dateModule.resetText;
      }
      const result = await ask(op);
      if (!disposed && id === operationId) { desktop = result; render(); }
      return result?.mode === "live";
    } catch {
      if (!disposed && id === operationId) { desktop = null; render(); }
      return false;
    }
  }

  context.subscriptions.push(quota, activity, connection, changed, vscode.window.registerTreeDataProvider("pawmetry.controls", provider),
    vscode.commands.registerCommand("pawmetry.connectDesktop", async () => {
      await exchange("status");
      if (!desktop) vscode.window.showInformationMessage("Start Pawmetry.exe or run npm.cmd run desktop in the Pawmetry repository, then reconnect.");
    }),
    vscode.commands.registerCommand("pawmetry.showDesktop", () => exchange("show")),
    vscode.commands.registerCommand("pawmetry.hideDesktop", () => exchange("hide")),
    vscode.commands.registerCommand("pawmetry.desktopSettings", () => exchange("settings")),
    vscode.commands.registerCommand("pawmetry.pauseAnimations", () => exchange("pause-animation")),
    vscode.commands.registerCommand("pawmetry.resumeAnimations", () => exchange("resume-animation")),
    vscode.commands.registerCommand("pawmetry.pauseMonitoring", () => exchange("pause-monitoring")),
    vscode.commands.registerCommand("pawmetry.resumeMonitoring", () => exchange("resume-monitoring")),
    vscode.commands.registerCommand("pawmetry.exitCompanion", async () => {
      const answer = await vscode.window.showWarningMessage("Exit the Pawmetry companion and stop background monitoring?", { modal: true }, "Exit");
      if (answer === "Exit") await exchange("quit");
    }),
    vscode.commands.registerCommand("pawmetry.refreshQuota", async () => {
      demo = null;
      render();
      return exchange("refresh");
    }),
    vscode.commands.registerCommand("pawmetry.nextSimulation", async () => {
      const { scenarios, simulate } = await bundled("packages/simulation/scenarios.ts");
      demo = simulate(scenarios[demoIndex]);
      demoIndex = (demoIndex + 1) % scenarios.length;
      render();
      return { quota: quota.text, activity: activity.text };
    }),
    vscode.commands.registerCommand("pawmetry.stopSimulation", () => {
      demo = null;
      render();
      return { quota: quota.text, activity: activity.text };
    }));
  const timer = setInterval(render, 1000);
  const poll = () => {
    reading ??= exchange("status").finally(() => { reading = null; });
  };
  const polling = setInterval(poll, 4000);
  context.subscriptions.push({ dispose() { disposed = true; clearInterval(timer); clearInterval(polling); } });
  render();
  poll();
  quota.show();
  activity.show();
  connection.show();
}

exports.activate = activate;
