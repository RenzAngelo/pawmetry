const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const { writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const vscode = require("vscode");

exports.run = async function () {
  const result = process.env.PAWMETRY_VSCODE_TEST_RESULT;
  assert.ok(result);
  try {
    const extension = vscode.extensions.getExtension(process.env.PAWMETRY_VSCODE_TEST_EXTENSION);
    assert.ok(extension);
    await extension.activate();
    const demo = await vscode.commands.executeCommand("pawmetry.nextSimulation");
    assert.match(demo.quota, /Sim · 92% \/ 85%/);
    const initial = await vscode.commands.executeCommand("pawmetry.stopSimulation");
    if (process.env.PAWMETRY_IPC_TEST_NAMESPACE) {
      assert.equal(await vscode.commands.executeCommand("pawmetry.refreshQuota"), true);
      const live = await vscode.commands.executeCommand("pawmetry.stopSimulation");
      assert.match(live.quota, /58% \/ 73%/);
      assert.equal(live.connection, "Pawmetry desktop · Live");
      assert.equal(live.quotaVisible, true);
      assert.equal(await vscode.commands.executeCommand("pawmetry.pauseMonitoring"), true);
      assert.equal(await vscode.commands.executeCommand("pawmetry.resumeMonitoring"), true);
    } else {
      assert.match(initial.quota, /\? \/ \?/);
      if (existsSync(join(extension.extensionPath, "companion-build.json"))) {
        assert.equal(initial.connection, "$(play) Start Pawmetry");
        assert.equal(initial.connectionCommand, "pawmetry.startCompanion");
        assert.equal(initial.quotaVisible, false);
      }
    }
    await writeFile(result, "passed", { flag: "wx" });
  } catch (error) {
    await writeFile(result, "failed", { flag: "wx" });
    throw error;
  }
};
