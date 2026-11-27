const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pawmetrySettings", {
  read: () => ipcRenderer.invoke("pawmetry:settings-read"),
  update: (key, value) => ipcRenderer.invoke("pawmetry:settings-update", key, value),
  action: (name) => ipcRenderer.invoke("pawmetry:settings-action", name),
  onView: (receive) => ipcRenderer.on("pawmetry:settings-view", (_event, view) => receive(view)),
});
