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
  win.loadURL('https://naitunai.github.io/DD/');

  // 临时诊断：打开 DevTools，看 Console 里点击时是否报安全错误
  win.webContents.openDevTools();
});
