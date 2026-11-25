const assert = require("node:assert/strict");
const { writeFile } = require("node:fs/promises");
const vscode = require("vscode");

exports.run = async function () {
  const result = process.env.PAWMETRY_VSCODE_TEST_RESULT;
  assert.ok(result);
  try {
    const extension = vscode.extensions.getExtension("pawmetry-local.pawmetry-prototype");
    assert.ok(extension);
    await extension.activate();
    const demo = await vscode.commands.executeCommand("pawmetry.nextSimulation");
    assert.match(demo.quota, /Sim · 92% \/ 85%/);
    assert.equal(demo.activity, "Sim activity · energetic");
    const initial = await vscode.commands.executeCommand("pawmetry.stopSimulation");
    assert.equal(initial.activity, "Activity · Unknown");
    assert.match(initial.quota, /\? \/ \?/);
    await writeFile(result, "passed", { flag: "wx" });
  } catch (error) {
    await writeFile(result, "failed", { flag: "wx" });
    throw error;
  }
};
