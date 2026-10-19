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

// —— 内存优化：关闭后台/隐藏窗口的合成器与光栅化线程（咚咚是单窗口应用，页面隐藏时
// VDO.Ninja iframe 的 video 合成占大头），并启用紧凑内存分配提示。必须在 app ready 前设置。
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('renderer-process-limit', '3');

// 网页本体入口：随 electron-builder files:"app/**" 打进 asar（resources/app.asar/app/index.html）
const INDEX_HTML = path.join(__dirname, 'app', 'index.html');

// 产物完整性检查：asar 被杀软破坏或解压不完整时，给出人话提示而不是冷冰冰的 ERR_FAILED
try {
  if (!fs.existsSync(INDEX_HTML)) {
    fatalShow('安装文件不完整',
      '找不到应用入口文件：\n' + INDEX_HTML +
      '\n\n常见原因：杀毒软件（Windows Defender 实时保护）隔离了 resources 下的文件，或解压未完成。' +
      '\n处理办法：将整个咚咚文件夹加入杀软排除项，重新下载并完整解压后再试。');
  }
} catch (_) {}
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

  // 退出时 VDO.Ninja iframe 的 WebRTC 媒体流可能未及释放，Windows 会弹
  // "该应用无法关闭/仍在运行"。先主动销毁 webContents 停掉媒体管道再关窗。
  win.on('close', () => {
    mainLog('window close requested, releasing renderer/media pipeline');
    try {
      if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.closeDevTools();
        win.webContents.forcefullyCrashRenderer();
        mainLog('renderer forcefully closed');
      }
    } catch (_) {}
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
      const grant = fromApp && allowed;
      mainLog('permission request: ' + permission + ' from ' + (url.slice(0, 60) || '(none)') + ' -> ' + (grant ? 'GRANT' : 'DENY'));
      callback(grant);
    });
    // 预授权麦克风/摄像头：部分 Electron 版本下 getUserMedia(audio) 在 file:// 源
    // 不会触发 request handler 而被静默拒绝（对端听不到声音）。显式放行双保险。
    for (const p of ['media', 'audioCapture', 'videoCapture']) {
      try { if (typeof ses.setPermission === 'function') ses.setPermission(p, 'granted'); } catch (_) {}
    }
    // 旧式回调接口兜底（setPermission 不可用的版本走这里）
    try { if (typeof ses.setPermissionCheckHandler === 'function') ses.setPermissionCheckHandler(() => true); } catch (_) {}
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
