import { BrowserWindow } from "electron";

export function localWindow(options, preload, backgroundThrottling = true) {
  const window = new BrowserWindow({ ...options, webPreferences: {
    preload, contextIsolation: true, sandbox: true, nodeIntegration: false,
    partition: "pawmetry-simulation", backgroundThrottling,
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
