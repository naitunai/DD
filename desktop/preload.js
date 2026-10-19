/* 咚咚 Electron preload：只向页面暴露最小必要信息，不开放任何 Node 能力。
 * window.dingdongDesktop.isDesktop === true，网页端（未来如需）可据此做差异化提示。
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('dingdongDesktop', {
  isDesktop: true,
  platform: process.platform,
});
