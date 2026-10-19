/* 把仓库根目录的网页本体同步进 desktop/app/，供 electron-builder 打包。
 * 用法：node sync-app.js（或 npm run sync-app）；build:win 前会自动执行。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');          // 仓库根目录
const dest = path.join(__dirname, 'app');         // desktop/app

const files = ['index.html', 'style.css', 'app.js', 'zh.js', 'file-transfer.js',
  'image-preview.js', 'screen-quality.js', 'demo-select.js', 'icon.svg'];

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, 'rnnoise'), { recursive: true });
for (const f of files) {
  fs.copyFileSync(path.join(root, f), path.join(dest, f));
}
for (const f of fs.readdirSync(path.join(root, 'rnnoise'))) {
  fs.copyFileSync(path.join(root, 'rnnoise', f), path.join(dest, 'rnnoise', f));
}
console.log('synced', files.length + ' files + rnnoise/ ->', dest);
