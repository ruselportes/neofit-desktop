const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  setNativeTheme: (theme) => ipcRenderer.invoke('set-native-theme', theme),
});
