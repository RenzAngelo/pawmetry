import { dialog, screen } from "electron";
import { fileURLToPath } from "node:url";
import { localWindow } from "./local-window.mjs";
import { placeSettings } from "./preferences.ts";

const page = new URL("./settings.html", import.meta.url);
const preload = fileURLToPath(new URL("./settings-preload.cjs", import.meta.url));
export const settingsUrl = page.href;

export function createSettingsWindow({ saved, move, visibility, fallback, closing }) {
  let window;
  let loading;

  function bounds(previous) {
    return placeSettings(previous, fallback(), screen.getAllDisplays().map(({ workArea }) => workArea));
  }

  function recover() {
    if (!window || window.isDestroyed() || window.isMinimized()) return;
    const current = window.getBounds();
    const fitted = bounds(current);
    if (Object.keys(fitted).some((key) => fitted[key] !== current[key])) {
      window.setMinimumSize(Math.min(300, fitted.width), Math.min(280, fitted.height));
      window.setBounds(fitted);
    }
  }

  async function open() {
    if (closing()) return;
    if (!window) {
      const initial = bounds(saved());
      const created = window = localWindow({ ...initial, title: "Pawmetry Settings", show: false, backgroundColor: "#152026",
        minWidth: Math.min(300, initial.width), minHeight: Math.min(280, initial.height), autoHideMenuBar: true }, preload);
      created.removeMenu();
      const changed = () => { if (!created.isDestroyed() && !created.isMinimized() && !created.isMaximized()) move(created.getBounds()); };
      created.on("move", changed);
      created.on("resize", changed);
      for (const event of ["show", "hide", "minimize", "restore"]) created.on(event, visibility);
      created.on("closed", () => { if (window === created) { window = undefined; loading = undefined; visibility(); } });
      created.webContents.on("render-process-gone", (_event, info) => { console.error("Settings renderer stopped", info.reason); if (!created.isDestroyed()) created.destroy(); });
      loading = created.loadFile(fileURLToPath(page)).then(() => true, (error) => {
        console.error("Settings navigation failed", error.code);
        if (!created.isDestroyed()) {
          created.destroy();
          dialog.showErrorBox("Pawmetry Settings", "The local Settings page could not load. Restart Pawmetry and check the installation.");
        }
        return false;
      });
    }
    const candidate = window;
    if (!await loading || candidate.isDestroyed() || closing()) return;
    if (candidate.isMinimized()) candidate.restore();
    recover();
    // In the tested Windows/Electron build, show() could leave a preloaded window hidden.
    candidate.showInactive();
    candidate.focus();
    return candidate;
  }

  return { open, recover, get window() { return window; } };
}
