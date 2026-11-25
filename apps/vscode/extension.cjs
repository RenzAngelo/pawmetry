const vscode = require("vscode");

function activate(context) {
  const quota = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const activity = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  let demo = null;
  let snapshot = null;
  let reading = false;
  let demoIndex = 0;
  const cancellation = new AbortController();
  quota.name = "Pawmetry quota";
  quota.command = "pawmetry.refreshQuota";
  activity.name = "Pawmetry activity";

  function render() {
    const percent = (value) => value === null || value === undefined ? "?" : value + "%";
    const now = Date.now();
    const windows = snapshot && now >= snapshot.observedAtMs && now < snapshot.validUntilMs
      ? snapshot.windows.filter((window) => window.resetsAtMs === null || now < window.resetsAtMs)
      : [];
    const remaining = (slot) => windows.find((window) => window.slot === slot)?.remainingPercent;
    const resetInfo = windows.filter((window) => window.slot !== "other" && window.resetsAtMs !== null).map((window) => {
      const minutes = Math.ceil((window.resetsAtMs - now) / 60000);
      const time = new Date(window.resetsAtMs).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
      const countdown = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
      return `${window.slot}: ${time} · ${countdown} left`;
    });
    const values = demo ? [demo.pet.energy, demo.pet.stamina] : [remaining("energy"), remaining("stamina")];
    quota.text = reading ? "Pawmetry · Reading quota…" :
      `${demo ? "Pawmetry Sim" : "Pawmetry"} · ${percent(values[0])} / ${percent(values[1])}`;
    quota.tooltip = demo ? "Simulated energy and stamina" :
      ["Codex energy and stamina. Select to refresh.", ...resetInfo].join("\n");
    activity.text = demo ? `Sim activity · ${demo.pet.pose}` : "Activity · Unknown";
    activity.tooltip = demo ? "Offline demonstration" : "Live activity requires a verified local activity source.";
  }

  context.subscriptions.push(quota, activity,
    vscode.commands.registerCommand("pawmetry.refreshQuota", async () => {
      if (reading || vscode.env.remoteName) return false;
      reading = true;
      demo = null;
      render();
      try {
        const { discoverCodex } = await import("../../tools/codex-quota-probe/discovery.ts");
        const result = await discoverCodex();
        if (result.status !== "found") {
          snapshot = null;
          return false;
        }
        const { probeQuota } = await import("../../tools/codex-quota-probe/app-server.ts");
        const { normalizeCodexSnapshot } = await import("../../tools/codex-quota-probe/telemetry.ts");
        snapshot = normalizeCodexSnapshot(await probeQuota(result.executable, { signal: cancellation.signal }), "editor");
        return true;
      } catch {
        snapshot = null;
        return false;
      } finally {
        reading = false;
        if (!cancellation.signal.aborted) render();
      }
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
  context.subscriptions.push({ dispose() { clearInterval(timer); cancellation.abort(); } });
  render();
  quota.show();
  activity.show();
}

exports.activate = activate;
