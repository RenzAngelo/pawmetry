import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cache = join(root, ".cache");
const source = join(root, "tools", "codex-activity-probe", "native-helper");
const go = join(cache, "go-sdk", "go", "bin", "go.exe");

export function buildActivityHelper(destination) {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("The activity helper targets Windows x64");
  mkdirSync(destination, { recursive: true });
  const env = { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
    GOCACHE: join(cache, "go-build"), GOTELEMETRYDIR: join(cache, "go-telemetry"),
    GOENV: "off", GOTOOLCHAIN: "local", GOPROXY: "off", GOSUMDB: "off", GOWORK: "off", CGO_ENABLED: "0",
    GOOS: "windows", GOARCH: "amd64" };
  const tool = spawnSync(go, ["version"], { env, encoding: "utf8", windowsHide: true });
  if (tool.status !== 0 || !/^go version go1\.27\.4 windows\/amd64\s*$/.test(tool.stdout)) {
    throw new Error("Verify and extract the pinned Go ZIP to .cache/go-sdk. See README.md.");
  }
  const test = spawnSync(go, ["test", "-trimpath", "./..."], { cwd: source, env, stdio: "inherit", windowsHide: true });
  if (test.status !== 0) throw new Error("Native activity helper tests failed");
  const output = join(destination, "PawmetryActivity.exe");
  const build = spawnSync(go, ["build", "-trimpath", "-buildvcs=false", "-ldflags=-s -w", "-o", output, "."],
    { cwd: source, env, stdio: "inherit", windowsHide: true });
  if (build.status !== 0) throw new Error("Native activity helper build failed");
  const hash = createHash("sha256").update(readFileSync(output)).digest("hex");
  writeFileSync(join(destination, "PawmetryActivity.sha256"), hash + "\n");
}

if (process.argv.includes("--development")) {
  buildActivityHelper(join(cache, "activity-helper"));
}
