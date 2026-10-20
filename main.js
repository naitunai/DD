const { app, BrowserWindow, Menu, session, desktopCapturer } = require('electron');

app.on('ready', () => {
 Menu.setApplicationMenu(null);

 const ses = session.defaultSession;

 // 放行媒体/屏幕捕获权限（含跨域 iframe 的请求）
 ses.setPermissionRequestHandler((wc, permission, callback) => {
 const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications'];
 callback(allowed.includes(permission));
 });

 // Windows 不支持 useSystemPicker：手动枚举屏幕/窗口源并回传，由系统展示选择 UI
 ses.setDisplayMediaRequestHandler(async (request, callback) => {
 console.log('[display-media] request from:', request.securityOrigin && request.securityOrigin.host);
 try {
 const sources = await desktopCapturer.getSources({
 types: ['screen', 'window'],
 thumbnailSize: { width: 800, height: 450 },
 fetchWindowIcons: true
 });
 if (!sources.length) return callback({});
 // 传入 source 数组 → Electron 弹出原生选择器；若你的版本不支持数组，改用下一行注释的单源写法
 callback({ video: sources, audio: 'loopback' });
 // callback({ video: sources[0], audio: 'loopback' }); // 保底：直接共享主屏
 } catch (err) {
 console.error('[display-media] failed:', err);
 callback({});
 }
 });

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
