import { screen } from "electron";
import { fileURLToPath } from "node:url";
import { localWindow, setPinned } from "./local-window.mjs";
import { placeCompanionMenu } from "./preferences.ts";

const page = new URL("./menu.html", import.meta.url);
const preload = fileURLToPath(new URL("./menu-preload.cjs", import.meta.url));
export const menuUrl = page.href;

export function createCompanionMenu(visibility) {
  let window;
  let loading;
  let generation = 0;

  function close() {
    ++generation;
    if (window?.isVisible()) window.hide();
  }

  async function open(pet, state) {
    if (window?.isVisible()) { close(); return; }
    const current = ++generation;
    if (!window) {
      const created = window = localWindow({ width: 256, height: 388, show: false, frame: false, resizable: false,
        skipTaskbar: true, title: "Pawmetry Options", backgroundColor: "#1b2527" }, preload);
      setPinned(created, true);
      created.on("blur", () => { if (created.isVisible()) close(); });
      created.on("show", visibility);
      created.on("hide", visibility);
      created.on("closed", () => { if (window === created) { window = undefined; loading = undefined; } });
      created.webContents.on("render-process-gone", () => { if (!created.isDestroyed()) created.destroy(); });
      loading = created.loadFile(fileURLToPath(page)).then(() => true, () => {
        if (!created.isDestroyed()) created.destroy();
        return false;
      });
    }
    const opened = window;
    if (!await loading || current !== generation || opened.isDestroyed() || pet.isDestroyed() || !pet.isVisible()) return;
    const anchor = pet.getBounds();
    const area = screen.getDisplayMatching(anchor).workArea;
    const target = placeCompanionMenu(anchor, area);
    const previous = opened.getBounds();
    if (previous.width > target.width || previous.height > target.height) {
      opened.setMinimumSize(Math.min(previous.width, target.width), Math.min(previous.height, target.height));
    }
    opened.setBounds(target);
    opened.showInactive();
    opened.focus();
    opened.webContents.send("pawmetry:menu-view", state());
  }

  return { open, close, get window() { return window; } };
}
