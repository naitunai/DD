const { app, BrowserWindow, Menu, session } = require('electron');

app.on('ready', () => {
  Menu.setApplicationMenu(null);

  const ses = session.defaultSession;

  // 放行媒体/屏幕捕获权限（含跨域 iframe 的请求）
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications'];
    callback(allowed.includes(permission));
  });

  // 关键：注册屏幕捕获请求处理器，让 Electron 弹出系统选择器
  ses.setDisplayMediaRequestHandler((request, callback) => {
    callback({ video: request.videoCarry ? 'screen' : null, audio: 'loopback' });
  }, { useSystemPicker: true });

  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundThrottling: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    return { action: 'allow' };
  });

  win.loadURL('https://naitunai.github.io/DD/');
});
