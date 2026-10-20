const { app, BrowserWindow, Menu, session, desktopCapturer, ipcMain } = require('electron');

let mainWin = null;

function diag(msg) {
 console.log('[diag]', msg);
 if (!mainWin || mainWin.isDestroyed()) return;
 const js = "try{var d=document.getElementById('__dd_diag');if(!d){d=document.createElement('div');d.id='__dd_diag';d.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#ffe08a;color:#333;font:12px monospace;padding:6px 10px;white-space:pre-wrap;max-height:40%;overflow:auto';document.body.appendChild(d)}var p=document.createElement('div');p.textContent=new Date().toLocaleTimeString()+'] '+__MSG__;d.appendChild(p)}catch(e){}".replace("__MSG__", JSON.stringify(String(msg).slice(0, 300)));
 mainWin.webContents.executeJavaScript(js).catch(() => {});
}

// 注入进 vdo.ninja iframe 的桥接脚本（executeJavaScript 跑在页面主世界）：
// 覆写 navigator.mediaDevices.getDisplayMedia —— VDO 官网的 Electron 补丁会先覆写它一次，
// 但本脚本在 frame finish-load 之后注入、且用微任务重试包裹，保证最终生效的是这个"走主进程预取源"的版本。
// 屏幕源列表由主进程 desktopCapturer.getSources() 预取后以 window.__ddPrefetched 注入（含合法 source id）。
const DD_BRIDGE = "(function(){try{" +
 "if(window.__ddBridgeV1)return'cached';window.__ddBridgeV1=1;" +
 "function req(){return new Promise(function(res,rej){var t=setInterval(function(){" +
 "if(window.__ddPrefetched&&window.__ddPrefetched.length){clearInterval(t);res(window.__ddPrefetched)}" +
 "},50);setTimeout(function(){clearInterval(t);rej(new Error('dd prefetch empty'))},9000)})}" +
 "window.ddGetSources=req;" +
 "var md=navigator.mediaDevices;if(!md)return'no mediaDevices';" +
 "md.getDisplayMedia=function(constraints){" +
 " return req().then(function(sources){" +
 "  var src=sources[0];" +
 "  var g={audio:false,video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:src.id}}};" +
 "  try{if(constraints&&constraints.video&&constraints.video.width&&constraints.video.width.ideal)g.video.mandatory.maxWidth=constraints.video.width.ideal}catch(e){}" +
 "  try{if(constraints&&constraints.video&&constraints.video.height&&constraints.video.height.ideal)g.video.mandatory.maxHeight=constraints.video.height.ideal}catch(e){}" +
 "  try{if(constraints&&constraints.video&&constraints.video.frameRate&&constraints.video.frameRate.ideal)g.video.mandatory.maxFrameRate=constraints.video.frameRate.ideal}catch(e){}" +
 "  return md.getUserMedia(g);" +
 " });" +
 "};" +
 "console.log('[dd-bridge] getDisplayMedia proxied');" +
 "return 'injected'}catch(e){return 'err '+e}})()";
app.on('ready', () => {
 Menu.setApplicationMenu(null);

 const ses = session.defaultSession;

 // VDO 的 Electron 补丁用老式 chromeMediaSource:desktop 起流，必须显式放行
 ses.setPermissionCheckHandler((wc, permission) => {
 const ok = ['media', 'display-capture'].includes(permission);
 if (ok) diag('check-allow: ' + permission);
 return ok;
 });

 ses.setPermissionRequestHandler((wc, permission, callback) => {
 diag('perm: ' + permission + ' from ' + (wc ? wc.getURL().slice(0, 50) : '?'));
 const allowed = ['media', 'mediaKeySystem', 'display-capture', 'notifications'];
 callback(allowed.includes(permission));
 });

 // VDO.Ninja 在 Electron 里会走它自己的老式捕获通道：ipcRenderer.sendSync('getSources') + getUserMedia(chromeMediaSource:'desktop')
 // 因此必须监听这个同步 IPC，把屏幕源列表回给它；否则 sendSync 返回 undefined，VDO 内部抛错，getDisplayMedia 永远发不出来
 ipcMain.on('getSources', async (event, options) => {
 try {
 const types = (options && options.types) || ['screen', 'window'];
 const sources = await desktopCapturer.getSources({ types, thumbnailSize: { width: 160, height: 90 } });
 diag('getSources ipc: ' + types.join(',') + ' -> ' + sources.length + ' source(s)');
 // 直接回传原生 DesktopCapturerSource 对象（含 .toDataURL()），VDO 的缩略图渲染依赖该方法
 event.returnValue = sources;
 } catch (err) {
 diag('getSources ipc FAILED: ' + err.message);
 event.returnValue = [];
 }
 });

 // preload 注入 require，供渲染层（含跨域 vdo.ninja iframe）调用 ipcRenderer.sendSync
 const path = require('path');

 // 标准通道保底（若 VDO 未拦截 getDisplayMedia 时才会走到这里）
 ses.setDisplayMediaRequestHandler(async (request, callback) => {
 diag('getDisplayMedia handler called, origin: ' + (request.securityOrigin && request.securityOrigin.host));
 try {
 const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
 diag('getSources ok: ' + sources.length + ' source(s)');
 if (!sources.length) { diag('NO SOURCES -> fail'); return callback({}); }
 callback({ video: sources[0], audio: 'loopback' });
 } catch (err) {
 diag('handler FAILED: ' + err.message);
 callback({});
 }
 });

 mainWin = new BrowserWindow({
 width: 1100,
 height: 720,
 backgroundThrottling: false,
 webPreferences: { nodeIntegration: false, contextIsolation: false, sandbox: false, preload: path.join(__dirname, 'preload.js') }
 });

 mainWin.webContents.on('console-message', (e, level, message) => {
 if (level >= 2 || /display|capture|share|permission|electron/i.test(message)) diag('renderer: ' + message.slice(0, 200));
 });
 mainWin.webContents.on('did-fail-load', (e, code, desc, url) => diag('page load fail: ' + code + ' ' + url));

 // [临时取证] 子 frame 导航/加载情况：确认 vdo.ninja iframe 是否真的加载成功
 mainWin.webContents.on('did-frame-load-start', (e, frameId, isMain, url) => {
   if (!isMain) diag('frame start: ' + String(url).slice(0, 90));
 });
 mainWin.webContents.on('did-frame-navigate', (e, url) => {
   if (/vdo\.ninja/.test(String(url))) diag('vdo frame nav: ' + String(url).slice(0, 90));
 });
 // [核心] 任何子 frame 开始加载就启动"桥接注入重试循环"：
 // load-start 时 frame 还没提交、fr.url 仍是旧值，必须轮询等它导航到 vdo.ninja 再注入（每 250ms×40 次≈10s）
 function bridgeLoop(wc) {
   if (wc.__ddLooping) return; wc.__ddLooping = true;
   let tries = 0;
   const tick = () => {
     if (wc.isDestroyed() || ++tries > 40) { wc.__ddLooping = false; return; }
     let alive = false;
     try {
       for (const fr of wc.mainFrame.framesInSubtree) {
         if (!/vdo\.ninja/.test(fr.url || '')) continue;
         alive = true;
         if (fr.__ddDone) continue;
         fr.__ddDone = true;
         diag('bridge target hit @try' + tries + ': ' + String(fr.url).slice(0, 60));
         fr.executeJavaScript(DD_BRIDGE, true).then(r => diag('vdo bridge: ' + r)).catch(err => { fr.__ddDone = false; diag('vdo bridge FAIL: ' + err.message); });
         desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }).then(sources => {
           diag('sources ready: ' + sources.length);
           const js = 'window.__ddPrefetched=' + JSON.stringify(sources.map(x => ({ id: x.id, name: x.name }))) + ';';
           return fr.executeJavaScript(js, true);
         }).then(() => diag('prefetch injected')).catch(err => diag('prefetch FAIL: ' + err.message));
       }
     } catch (err) { diag('bridge loop err: ' + err.message); }
     setTimeout(tick, 250); // 无论本轮是否命中都续跑到上限，避免 frame 注册延迟导致的早退
   };
   setTimeout(tick, 120);
 }
 // [取证] load-start 是否触发（v14 实测未触发，保留观察）
 mainWin.webContents.on('did-frame-load-start', (e, frameId, isMain, url) => {
   diag('LS@' + String(url).slice(0, 60));
   if (!isMain) bridgeLoop(mainWin.webContents);
 });
 // [核心] 子 frame 导航到 vdo.ninja 的瞬间就开轮询注入（此事件已验证可靠触发）
 mainWin.webContents.on('did-frame-navigate', (e, url) => {
   if (/vdo\.ninja/.test(String(url || ''))) bridgeLoop(mainWin.webContents);
 });
 // [兜底] frame 加载完成后再来一轮，防止导航时机仍错过
 mainWin.webContents.on('did-frame-finish-load', (e, isMain) => {
   if (!isMain) bridgeLoop(mainWin.webContents);
 });
 mainWin.webContents.on('did-frame-finish-load', (e, isMain, p) => {
   if (!isMain) diag('frame finish: ' + String(p).slice(0, 90));
 });
 mainWin.webContents.on('render-process-gone', (e, d) => diag('RENDERER GONE: ' + JSON.stringify(d)));
 // [临时取证] 顶层页面里挂钩子，捕获 iframe 加载失败与 JS 异常（error 事件捕获阶段可看到子资源失败）
 mainWin.webContents.once('dom-ready', () => {
   const hook = "try{window.addEventListener('error',function(ev){var t=ev.target;if(t&&t.tagName==='IFRAME'){console.error('DDHOOK iframe load fail: '+(t.src||'').slice(0,80))}else if(ev.message){console.error('DDHOOK js: '+ev.message+' @'+String(ev.filename||'').slice(0,50))}},true);}catch(e){}";
   mainWin.webContents.executeJavaScript(hook).catch(() => {});
 });

 mainWin.webContents.setWindowOpenHandler(({ url }) => ({ action: 'allow' }));
 mainWin.loadURL('https://naitunai.github.io/DD/');
 mainWin.webContents.on('dom-ready', () => diag('shell ready: diag mode v15 (nav-bridge)'));
});
