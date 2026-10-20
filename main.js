const { app, BrowserWindow } = require('electron');
const path = require('path');

app.on('ready', () => {
  const win = new BrowserWindow({
    width: 1100, height: 720,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  // 在线壳：直接打开你的 Pages（用户必须联网）
  win.loadURL('https://naitunai.github.io/DD/');
});
