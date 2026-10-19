/* 咚咚 Electron 桌面端主进程（绿色版）
 * 离线加载打包进 app 的网页本体（app/index.html），不依赖任何线上地址。
 * 壳层职责：创建窗口、麦克风/摄像头授权、媒体设备枚举、外部链接走系统浏览器。
 * P2P 音视频仍由页面内 VDO.Ninja iframe 完成，这里不注入业务逻辑。
 *
 * 启动策略（保守）：窗口创建即显示，不做 show:false / ready-to-show 隐藏等待——
 * 即使页面加载慢或事件异常，用户至少能看到窗口；诊断日志与错误弹窗全部容错降级，
 * 任何辅助代码都不允许拖垮主流程。
 */
const { app, BrowserWindow, session, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// —— 诊断辅助：全部 try 包裹，失败仅静默跳过 ——
let logDir = '';
try {
  logDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logDir, { recursive: true });
} catch (_) {}

function mainLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { console.log(msg); } catch (_) {}
  try { if (logDir) fs.appendFileSync(path.join(logDir, 'main.log'), line); } catch (_) {}
}

// 致命错误尽力弹窗（dialog 不可用时只留日志）
function fatalShow(title, detail) {
  mainLog('FATAL ' + title + ': ' + detail);
  try {
    const { dialog } = require('electron');
    dialog.showErrorBox(title, String(detail).slice(0, 4000) +
      '\n\n日志位置: ' + (logDir ? path.join(logDir, 'main.log') : '%APPDATA%\\dingdong-desktop\\logs\\main.log'));
  } catch (_) {}
}

process.on('uncaughtException', (err) => {
  fatalShow('咚咚启动出错（未捕获异常）', (err && err.stack) || String(err));
});
process.on('unhandledRejection', (err) => {
  mainLog('unhandledRejection: ' + ((err && err.stack) || err));
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

  // 立即显示窗口：不等 ready-to-show，避免任何事件缺失导致"有进程无窗口"
  win.show();
  mainLog('window created, showing immediately');

  win.loadFile(INDEX_HTML).then(() => {
    mainLog('index.html loadFile resolved OK');
  }).catch((err) => {
    fatalShow('页面加载失败', (err && err.stack) || String(err));
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    mainLog('did-fail-load: code=' + code + ' desc=' + desc + ' url=' + url);
  });
  win.webContents.on('dom-ready', () => {
    mainLog('dom-ready');
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    try {
      mainLog('render-process-gone: ' + JSON.stringify(details));
    } catch (_) {
      mainLog('render-process-gone');
    }
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

  try {
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      // 本地加载时 requestingUrl 为 file://（VDO.Ninja iframe 为 https），两者都属应用自身
      const url = (details && details.requestingUrl) || '';
      const fromApp = url.startsWith('file:') || url.startsWith('http:');
      const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications'].includes(permission);
      callback(fromApp && allowed);
    });
  } catch (err) {
    mainLog('setPermissionRequestHandler failed: ' + ((err && err.message) || err));
  }

  // Windows 上枚举音频设备需显式开启；方法不存在时静默跳过（不影响启动）
  try {
    if (isWin && typeof ses.enableDeviceEventEmitter === 'function') ses.enableDeviceEventEmitter();
  } catch (_) {}

  try {
    if (ses.on) ses.on('notification-clicked', () => { if (win) win.focus(); });
  } catch (_) {}

  try {
    if (!isWin) Menu.setApplicationMenu(null);
    else Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' },
    ]));
  } catch (err) {
    mainLog('menu setup failed: ' + ((err && err.message) || err));
  }

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch((err) => {
  fatalShow('whenReady 失败', (err && err.stack) || String(err));
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
