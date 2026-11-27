import { BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";

const appIcon = fileURLToPath(new URL("../../assets/branding/pawmetry/app.png", import.meta.url));

export function setPinned(window, pinned) {
  // Electron's default Windows level positions the window behind Shell_TrayWnd.
  // When that taskbar HWND isn't topmost, Windows demotes the window too.
  window.setAlwaysOnTop(pinned, process.platform === "win32" ? "pop-up-menu" : "floating");
}

export function localWindow(options, preload, backgroundThrottling = true) {
  const window = new BrowserWindow({ icon: appIcon, ...options, webPreferences: {
    preload, contextIsolation: true, sandbox: true, nodeIntegration: false,
    partition: "pawmetry-ui", backgroundThrottling, devTools: false,
  } });
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.on("will-frame-navigate", (event) => event.preventDefault());
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
  contents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] },
    (_details, callback) => callback({ cancel: true }));
  return window;
}

export function isLocalSender(event, window, url) {
  return !!window && !window.isDestroyed() && event.sender === window.webContents
    && event.senderFrame === window.webContents.mainFrame && event.senderFrame?.url.split("#", 1)[0] === url;
}
