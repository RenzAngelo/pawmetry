const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pawmetry", {
  onView: (receive) => { ipcRenderer.on("pawmetry:view", (_event, view) => receive(view)); },
  onFocusOptions: (receive) => { ipcRenderer.on("pawmetry:focus-options", () => receive()); },
  command: (op) => ipcRenderer.invoke("pawmetry:control", op),
});
