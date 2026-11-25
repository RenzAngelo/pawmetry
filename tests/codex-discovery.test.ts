import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { findBundledCodex } from "../tools/codex-quota-probe/discovery.ts";

async function directory(t: TestContext) {
  const path = await mkdtemp(join(tmpdir(), "pawmetry-discovery-"));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function install(directory: string, version: string, publisher = "openai") {
  const root = join(directory, `openai.chatgpt-${version}-win32-x64`);
  const bin = join(root, "bin", "windows-x86_64");
  await mkdir(bin, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ publisher, name: "chatgpt", version }));
  const executable = join(bin, "codex.exe");
  await writeFile(executable, "inert fixture");
  return executable;
}

test("discovers a matching native bundle with versioned metadata", async (t) => {
  const root = await directory(t);
  const executable = await install(root, "26.1120.50957");
  await install(root, "27.1.1", "other");
  assert.deepEqual(await findBundledCodex(root), { status: "found", executable, version: "26.1120.50957" });
});

test("does not guess between installed versions", async (t) => {
  const root = await directory(t);
  await install(root, "26.1120.50957");
  await install(root, "26.1121.100");
  assert.deepEqual(await findBundledCodex(root), { status: "ambiguous" });
});

test("ignores shims, missing bundles, and relative search directories", async (t) => {
  const root = await directory(t);
  await writeFile(join(root, "codex.cmd"), "inert fixture");
  assert.deepEqual(await findBundledCodex(root), { status: "missing" });
  assert.deepEqual(await findBundledCodex("."), { status: "missing" });
});

test("rejects an executable path redirected outside the installation", async (t) => {
  const root = await directory(t);
  const outside = await directory(t);
  const executable = await install(root, "26.1120.50957");
  await writeFile(join(outside, "codex.exe"), "outside fixture");
  const bin = join(root, "openai.chatgpt-26.1120.50957-win32-x64", "bin", "windows-x86_64");
  await rm(executable);
  await rm(bin, { recursive: true });
  await symlink(outside, bin, process.platform === "win32" ? "junction" : "dir");
  assert.deepEqual(await findBundledCodex(root), { status: "missing" });
});
