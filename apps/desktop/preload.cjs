const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pawmetry", {
  onView: (receive) => { ipcRenderer.on("pawmetry:view", (_event, view) => receive(view)); },
  onFocusOptions: (receive) => { ipcRenderer.on("pawmetry:focus-options", () => receive()); },
  reportViewport: (width, height) => ipcRenderer.send("pawmetry:viewport", width, height),
  onViewportRequest: (receive) => { ipcRenderer.on("pawmetry:request-viewport", () => receive()); },
  drag: (phase, x, y) => ipcRenderer.send("pawmetry:drag", phase, x, y),
  command: (op) => ipcRenderer.invoke("pawmetry:control", op),
});
