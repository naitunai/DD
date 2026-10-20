// preload：为 VDO.Ninja 的 Electron 屏幕共享补丁提供 require('electron').ipcRenderer
(() => {
 try {
   const electron = require('electron');
   if (typeof window.require !== 'function') window.require = (name) => (name === 'electron' ? electron : require(name));
   if (!window.ipcRenderer && electron.ipcRenderer) window.ipcRenderer = electron.ipcRenderer;
   console.log('[dd-preload] ok, ipcRenderer injected');
 } catch (e) { console.warn('[dd-preload] err:', e.message); }
})();
