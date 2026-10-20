const { app, BrowserWindow, Menu, session, desktopCapturer } = require('electron');

app.on('ready', () => {
 Menu.setApplicationMenu(null);

 const ses = session.defaultSession;

 // 放行媒体/屏幕捕获权限（含跨域 iframe 的请求）
 ses.setPermissionRequestHandler((wc, permission, callback) => {
 console.log('[perm]', permission, 'from', wc && wc.getURL().slice(0, 60));
 const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications'];
 callback(allowed.includes(permission));
 });

 // 屏幕捕获：回传单个主屏 source
 ses.setDisplayMediaRequestHandler(async (request, callback) => {
 console.log('[dmr] handler called, securityOrigin:', JSON.stringify(request.securityOrigin));
 try {
 const sources = await desktopCapturer.getSources({
 types: ['screen'],
 thumbnailSize: { width: 0, height: 0 }
 });
 console.log('[dmr] sources:', sources.map(s => s.id).join(', '));
 if (!sources.length) return callback({});
 callback({ video: sources[0], audio: 'loopback' });
 console.log('[dmr] callback done with', sources[0].id);
 } catch (err) {
 console.error('[dmr] FAILED:', err);
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

 // 诊断：把渲染进程控制台输出转发到终端
 win.webContents.on('console-message', (e, level, message) => {
 console.log('[renderer]', message);
 });
 win.webContents.on('did-fail-load', (e, code, desc, url) => {
 console.log('[fail-load]', code, desc, url);
 });

 win.webContents.setWindowOpenHandler(({ url }) => {
 return { action: 'allow' };
 });

 win.loadURL('https://naitunai.github.io/DD/');
});
