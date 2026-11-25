const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pawmetryMenu", {
  command: (action) => ipcRenderer.invoke("pawmetry:menu-command", action),
  onView: (receive) => ipcRenderer.on("pawmetry:menu-view", (_event, view) => receive(view)),
});
