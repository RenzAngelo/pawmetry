import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const id = randomBytes(16).toString("hex");
const launch = fileURLToPath(new URL("./launch-desktop.mjs", import.meta.url));
const env = { ...process.env, PAWMETRY_LOCK_TEST_ID: id };

function desktop() {
  const child = spawn(process.execPath, [launch, "--smoke-lock"], {
    env, stdio: ["ignore", "pipe", "inherit"], windowsHide: true,
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  return { child, closed: once(child, "close"), output: () => stdout };
}

const first = desktop();
let next;
try {
  // The primary process exits automatically if a second launch fails to arrive.
  while (!first.output().includes("Desktop lock ready.")) {
    const outcome = await Promise.race([once(first.child.stdout, "data").then(() => null), first.closed]);
    if (outcome) throw new Error("Primary desktop did not acquire the test lock.");
  }
  next = desktop();
  const [[firstCode], [secondCode]] = await Promise.all([first.closed, next.closed]);
  const observed = JSON.stringify({ primary: first.output().trim(), secondary: next.output().trim() });
  assert.equal(firstCode, 0, observed);
  assert.equal(secondCode, 0, observed);
  assert.match(first.output(), /Second desktop launch reached the primary instance/);
  assert.match(next.output(), /Second desktop launch exited without a lock/);
  console.log("Desktop single-instance smoke passed.");
} finally {
  await Promise.allSettled([first.closed, next?.closed]);
  await rm(fileURLToPath(new URL("../.cache/desktop-lock-" + id, import.meta.url)), { recursive: true, force: true }).catch(() => {});
}
