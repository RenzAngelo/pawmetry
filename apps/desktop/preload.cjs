const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pawmetry", {
  onSimulation: (receive) => { ipcRenderer.on("pawmetry:simulation", (_event, view) => receive(view)); },
});
