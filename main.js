const { app, BrowserWindow, Menu } = require('electron');

app.on('ready', () => {

  // 去掉窗口顶部的 File/Edit/View... 菜单栏
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  // 允许页面弹窗，并把它们作为新窗口打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    return { action: 'allow' };
  });
