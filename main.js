const { app, BrowserWindow, Menu, session, desktopCapturer } = require('electron');

app.on('ready', () => {
 Menu.setApplicationMenu(null);

 const ses = session.defaultSession;

 // 放行媒体/屏幕捕获权限（含跨域 iframe 的请求）
 ses.setPermissionRequestHandler((wc, permission, callback) => {
 const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications'];
 callback(allowed.includes(permission));
 });

 // 屏幕捕获：枚举源后回传单个主屏 source（Electron 33 稳定用法）
 ses.setDisplayMediaRequestHandler(async (request, callback) => {
 console.log('[display-media] request from:', request.securityOrigin && request.securityOrigin.host);
 try {
 const sources = await desktopCapturer.getSources({
 types: ['screen'],
 thumbnailSize: { width: 0, height: 0 }
 });
 if (!sources.length) return callback({});
 callback({ video: sources[0], audio: 'loopback' });
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
