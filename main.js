const { app, BrowserWindow, Menu, session, desktopCapturer } = require('electron');

let mainWin = null;

// 诊断信息直接显示在窗口顶部黄色条（双击 exe 也能看到）
function diag(msg) {
 console.log('[diag]', msg);
 if (!mainWin || mainWin.isDestroyed()) return;
 const js = "try{var d=document.getElementById('__dd_diag');if(!d){d=document.createElement('div');d.id='__dd_diag';d.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#ffe08a;color:#333;font:12px monospace;padding:6px 10px;white-space:pre-wrap;max-height:40%;overflow:auto';document.body.appendChild(d)}var p=document.createElement('div');p.textContent=new Date().toLocaleTimeString()+'] '+__MSG__;d.appendChild(p)}catch(e){}".replace('__MSG__', JSON.stringify(String(msg).slice(0, 300)));
 mainWin.webContents.executeJavaScript(js).catch(() => {});
}

app.on('ready', () => {
 Menu.setApplicationMenu(null);

 const ses = session.defaultSession;

 ses.setPermissionRequestHandler((wc, permission, callback) => {
 diag('perm: ' + permission + ' from ' + (wc ? wc.getURL().slice(0, 50) : '?'));
 const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications'];
 callback(allowed.includes(permission));
 });

 ses.setDisplayMediaRequestHandler(async (request, callback) => {
 diag('getDisplayMedia handler called, origin: ' + (request.securityOrigin && request.securityOrigin.host));
 try {
 const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
 diag('getSources ok: ' + sources.length + ' source(s)');
 if (!sources.length) { diag('NO SOURCES -> fail'); return callback({}); }
 callback({ video: sources[0], audio: 'loopback' });
 diag('callback done: ' + sources[0].id);
 } catch (err) {
 diag('handler FAILED: ' + err.message);
 callback({});
 }
 });

 mainWin = new BrowserWindow({
 width: 1100,
 height: 720,
 backgroundThrottling: false,
 webPreferences: { nodeIntegration: false, contextIsolation: true }
 });

 mainWin.webContents.on('console-message', (e, level, message) => {
 if (level >= 2 || /display|capture|share|permission/i.test(message)) diag('renderer: ' + message.slice(0, 200));
 });
 mainWin.webContents.on('did-fail-load', (e, code, desc, url) => diag('page load fail: ' + code + ' ' + url));

 mainWin.webContents.setWindowOpenHandler(({ url }) => ({ action: 'allow' }));
 mainWin.loadURL('https://naitunai.github.io/DD/');
 mainWin.webContents.on('dom-ready', () => diag('shell ready: diag mode ON'));
});
