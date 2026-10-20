const { app, BrowserWindow, Menu } = require('electron');

app.on('ready', () => {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.log('[did-fail-load]', code, desc, url);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    return { action: 'allow' };
  });

  win.loadURL('https://naitunai.github.io/DD/');
});
