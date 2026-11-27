const vscode = require("vscode");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { loadCompanion, startCompanion } = require("./companion.cjs");

const packaged = join(__dirname, "shared");
const shared = existsSync(packaged) ? packaged : join(__dirname, "..", "..");
const bundled = (path) => import(pathToFileURL(join(shared, path)).href);

function activate(context) {
  const quota = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const connection = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
  let demo = null;
  let desktop = null;
  let reading = null;
  let operationId = 0;
  let disposed = false;
  let demoIndex = 0;
  let ask;
  let resetText;
  let launching;
  let quotaVisible = false;
  const hasBundle = existsSync(join(context.extensionPath ?? __dirname, "companion-build.json"));
  const canStart = () => hasBundle && process.platform === "win32" && process.arch === "x64"
    && !vscode.env.remoteName && vscode.workspace.isTrusted;
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
    const actions = desktop ? (canStart() ? [["Start or update companion", "startCompanion"], ...controls] : controls)
      : canStart() ? [["Start Pawmetry", "startCompanion"]] : controls.slice(0, 1);
    return [...rows.map((label) => new vscode.TreeItem(label)), ...actions.map(([label, command]) => {
      const item = new vscode.TreeItem(label);
      item.command = { command: `pawmetry.${command}`, title: label };
      return item;
    })];
  } };
  quota.name = "Pawmetry quota";
  quota.command = "pawmetry.refreshQuota";
  connection.name = "Pawmetry desktop connection";

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
    const showQuota = !!(desktop || demo) || !canStart();
    if (showQuota !== quotaVisible) {
      quotaVisible = showQuota;
      if (showQuota) quota.show(); else quota.hide();
    }
    const health = desktop?.quota === "fresh" && !valid ? "stale" : desktop?.quota;
    connection.command = canStart() ? "pawmetry.startCompanion" : "pawmetry.connectDesktop";
    connection.text = launching ? "$(sync~spin) Starting Pawmetry…"
      : desktop ? "Pawmetry desktop · " + (desktop.mode === "simulation" ? "Simulation" : valid ? "Live" : "Quota " + health)
      : canStart() ? "$(play) Start Pawmetry" : "Pawmetry desktop · Disconnected";
    connection.tooltip = launching ? "Pawmetry is connecting to the desktop companion."
      : desktop ? (canStart() ? "Click to show Pawmetry or apply an available companion update." : "Connected to the local desktop companion.")
      : canStart() ? "Left-click to start the Pawmetry desktop companion." : "Start the companion and enable live quota from its tray menu.";
    const next = [showQuota ? connection.text : null, showQuota ? quota.text : null, ...resetInfo].filter(Boolean);
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

  context.subscriptions.push(quota, connection, changed, vscode.window.registerTreeDataProvider("pawmetry.controls", provider),
    vscode.commands.registerCommand("pawmetry.startCompanion", async () => {
      if (process.platform !== "win32" || process.arch !== "x64" || vscode.env.remoteName || !vscode.workspace.isTrusted) {
        return vscode.window.showInformationMessage("Open a trusted local workspace in VS Code for Windows x64 to start Pawmetry.");
      }
      if (!hasBundle) return vscode.window.showInformationMessage("This package uses the separate Pawmetry desktop ZIP. Open Pawmetry.exe, then reconnect.");
      if (context.extensionMode === vscode.ExtensionMode.Test) return;
      launching ??= vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Connecting Pawmetry" }, async () => {
        const bundle = await loadCompanion(context.extensionPath);
        const [{ windowsEndpoint }, { askStatus }] = await Promise.all([
          bundled("packages/ipc/discovery.ts"), bundled("packages/ipc/transport.ts"),
        ]);
        const result = await startCompanion({ bundle, read: () => windowsEndpoint("read"), ask: askStatus,
          async confirm(action) {
            if (action === "start" && context.globalState.get("liveQuotaStartAccepted")) return true;
            const update = action === "update";
            const button = update ? "Restart" : "Start";
            const message = update
              ? "Restart Pawmetry to apply the update? The companion reads live Codex account quota unless you’ve turned it off."
              : "Start Pawmetry and read live Codex account quota? Pawmetry can run in the background. To stop quota requests, use Connections in Pawmetry Settings or exit from the Windows tray.";
            const accepted = button === await vscode.window.showInformationMessage(message, { modal: true }, button);
            if (accepted) await context.globalState.update("liveQuotaStartAccepted", true);
            return accepted;
          },
        });
        if (result === "cancelled") return;
        ask = undefined;
        await exchange("status");
        if (result === "existing") vscode.window.showInformationMessage(
          "A separate Pawmetry build is running. To switch to the bundled one, exit Pawmetry from the tray and run Start Companion again.");
        if (result === "restart-needed") vscode.window.showWarningMessage("Pawmetry did not finish restarting. Exit it from the tray, then choose Start Companion again.");
        if (result === "unavailable") vscode.window.showWarningMessage("Pawmetry did not connect. Check Windows notifications and try Start Companion again.");
      }).catch(() => vscode.window.showWarningMessage("Pawmetry could not start its bundled companion. Reinstall the VSIX or check Windows security notifications."))
        .finally(() => { launching = undefined; if (!disposed) render(); });
      render();
      return launching;
    }),
    vscode.commands.registerCommand("pawmetry.connectDesktop", async () => {
      await exchange("status");
      if (!desktop) vscode.window.showInformationMessage(hasBundle ? "Click Start Pawmetry in the VS Code status bar."
        : "Extract the Pawmetry Windows ZIP and open Pawmetry.exe. Enable Live Codex quota from its tray menu, then reconnect.");
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
    ...(!hasBundle || context.extensionMode === vscode.ExtensionMode.Test ? [vscode.commands.registerCommand("pawmetry.nextSimulation", async () => {
      const { scenarios, simulate } = await bundled("packages/simulation/scenarios.ts");
      demo = simulate(scenarios[demoIndex]);
      demoIndex = (demoIndex + 1) % scenarios.length;
      render();
      return { quota: quota.text };
    }),
    vscode.commands.registerCommand("pawmetry.stopSimulation", () => {
      demo = null;
      render();
      return { quota: quota.text, connection: connection.text, connectionCommand: connection.command, quotaVisible };
    })] : []));
  const timer = setInterval(render, 1000);
  const poll = () => {
    reading ??= exchange("status").finally(() => { reading = null; });
  };
  const polling = setInterval(poll, 4000);
  context.subscriptions.push({ dispose() { disposed = true; clearInterval(timer); clearInterval(polling); } });
  render();
  poll();
  connection.show();
}

exports.activate = activate;
