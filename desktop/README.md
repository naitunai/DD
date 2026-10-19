# 咚咚桌面端（绿色版 ZIP）

Electron 壳离线加载网页本体（打进 `app/` 目录），**不依赖线上地址**；构建产物只有一个 zip，解压双击 `DingDong.exe` 即用。

## 文件结构

```
desktop/
├── package.json   # Electron + electron-builder 清单（zip 目标）
├── main.js        # 主进程：窗口、file:// 加载、权限、外链拦截
├── preload.js     # 仅暴露 window.dingdongDesktop 标记
├── sync-app.js    # 把仓库根目录的网页本体同步进 desktop/app/
└── assets/        # 需自行放入 icon.ico（缺省用 Electron 默认图标）
```

## 构建 Windows 绿色版

在**你自己的电脑**上（本沙箱不能运行 Electron）：

```bash
cd desktop
npm install              # 装 electron / electron-builder
npm run build:win        # 自动先 sync-app，再打包
```

产物在 `desktop/release/DingDong-Windows.zip`——解压后整个文件夹发给任何人，双击 `DingDong.exe` 即可使用，无需安装。

想先本地看效果：`npm start`（同样离线加载 app/ 里的页面）。

## 更新流程

网页本体改动后（比如改了根目录 app.js），只需重新跑 `npm run build:win`，`sync-app.js` 会把最新文件拷进 `desktop/app/` 再打包，不用手动同步。

## 关键行为说明

| 项 | 策略 |
|---|---|
| 页面来源 | 随包携带的 `app/index.html`（file:// 离线加载） |
| 麦克风/摄像头 | 放行 file:// 与 http(s) 发起的 `media` 请求（VDO.Ninja iframe 需要） |
| 屏幕共享 | 放行 `display-capture`，由系统选择器决定 |
| 桌面通知 | 放行 `notifications`，点击聚焦窗口 |
| 外部链接 | `window.open` / `target=_blank` 交系统浏览器，不新开 Electron 窗 |
| Node 能力 | 页面完全无 Node（contextIsolation + 最小 preload） |

## 注意事项

- **联网仍必需**：消息点对点传输和音视频依赖 VDO.Ninja 信令，离线壳只是不带业务代码，运行时仍需网络。
- **Windows 选不到麦克风列表**：main.js 已调用 `enableDeviceEventEmitter()`；异常时升级 Electron ≥ 44。
- **图标**：`assets/icon.ico` 缺失时 electron-builder 会用默认图标，可先跑通再补。
