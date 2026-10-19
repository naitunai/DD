/* 咚咚 Electron 桌面端主进程（绿色版）
 * 离线加载打包进 app 的网页本体（app/index.html），不依赖任何线上地址。
 * 壳层职责：创建窗口、麦克风/摄像头授权、媒体设备枚举、外部链接走系统浏览器。
 * P2P 音视频仍由页面内 VDO.Ninja iframe 完成，这里不注入业务逻辑。
 */
const { app, BrowserWindow, session, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// 启动诊断日志：双击闪退时可到 %APPDATA%/dingdong-desktop/logs 里找原因
let logDir = '';
try {
  logDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
} catch (_) {}
function mainLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(path.join(logDir, 'main.log'), line); } catch (_) {}
  console.log(msg);
}
process.on('uncaughtException', (err) => {
  mainLog('uncaughtException: ' + (err && err.stack || err));
});
process.on('unhandledRejection', (err) => {
  mainLog('unhandledRejection: ' + (err && err.stack || err));
});

// 网页本体目录：随 electron-builder files:"app/**" 打进 asar
const INDEX_HTML = path.join(__dirname, 'app', 'index.html');
const isWin = process.platform === 'win32';

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 520,
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    title: '咚咚',
    icon: path.join(__dirname, 'assets', isWin ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload 需要 require electron 模块（仅暴露最小标记给页面）
    },
  });

  win.loadFile(INDEX_HTML).then(() => {
    mainLog('window created, index.html loaded OK');
  }).catch((err) => {
    mainLog('loadFile failed: ' + (err && err.stack || err));
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    mainLog('render-process-gone: ' + JSON.stringify(details));
  });
  win.on('closed', () => { win = null; });

  // 页内 target=_blank / window.open 一律交给系统浏览器，保持单窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// 权限策略：只放行应用自身的媒体/通知权限，其余全部拒绝
app.whenReady().then(() => {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    // 本地加载时 requestingUrl 为 file://（VDO.Ninja iframe 为 https），两者都属应用自身
    const url = (details && details.requestingUrl) || '';
    const fromApp = url.startsWith('file:') || url.startsWith('http:');
    const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications'].includes(permission);
    callback(fromApp && allowed);
  });

  // Windows 上 Electron 不会自动枚举音频设备，需显式开启（否则选不到麦克风列表）
  // 该方法在部分 Electron 版本不存在，必须容错，否则主进程启动即崩、双击无窗口
  try { if (isWin && typeof ses.enableDeviceEventEmitter === 'function') ses.enableDeviceEventEmitter(); } catch (_) {}

  if (ses.on) ses.on('notification-clicked', () => { if (win) win.focus(); });

  if (!isWin) Menu.setApplicationMenu(null);
  else Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' },
  ]));

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
