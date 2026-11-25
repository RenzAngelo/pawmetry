const vscode = require("vscode");

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
  quota.name = "Pawmetry quota";
  quota.command = "pawmetry.refreshQuota";
  activity.name = "Pawmetry activity";
  connection.name = "Pawmetry desktop connection";
  connection.command = "pawmetry.refreshQuota";

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
    activity.text = demo ? `Sim activity · ${demo.pet.pose}` : "Activity · Unknown";
    activity.tooltip = demo ? "Offline demonstration" : "Live activity requires a verified local activity source.";
    const health = desktop?.quota === "fresh" && !valid ? "stale" : desktop?.quota;
    connection.text = desktop ? "Pawmetry desktop · " + (desktop.mode === "simulation" ? "Simulation" : valid ? "Live" : "Quota " + health)
      : "Pawmetry desktop · Disconnected";
    connection.tooltip = desktop ? "Connected to the local desktop companion"
      : "Start the companion and enable live quota from its tray menu.";
  }

  async function exchange(op) {
    if (process.platform !== "win32" || vscode.env.remoteName || !vscode.workspace.isTrusted || disposed) return false;
    const id = ++operationId;
    try {
      if (!ask) {
        const [clientModule, dateModule] = await Promise.all([
          import("../../packages/ipc/client.ts"), import("../../packages/telemetry/time-display.ts"),
        ]);
        if (context.extensionMode === vscode.ExtensionMode.Test) {
          const namespace = process.env.PAWMETRY_IPC_TEST_NAMESPACE;
          if (namespace && /^[a-f0-9]{32}$/.test(namespace)) {
            const { windowsEndpoint } = await import("../../packages/ipc/discovery.ts");
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

  context.subscriptions.push(quota, activity, connection,
    vscode.commands.registerCommand("pawmetry.refreshQuota", async () => {
      demo = null;
      render();
      return exchange("refresh");
    }),
    vscode.commands.registerCommand("pawmetry.nextSimulation", async () => {
      const { scenarios, simulate } = await import("../../packages/simulation/scenarios.ts");
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
