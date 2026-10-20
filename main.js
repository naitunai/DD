const { app, BrowserWindow, Menu, session } = require('electron');

app.on('ready', () => {
  Menu.setApplicationMenu(null);

  // 授予媒体/屏幕捕获权限：否则远程站点的 getDisplayMedia 在 Electron 内静默失败
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications'];
    callback(allowed.includes(permission));
  });

  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    // 关闭后台节流：避免共享窗口被浮层遮挡、确认后无画面
    backgroundThrottling: false,
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
