import { defineConfig } from "wxt";
import packageJson from "../../package.json";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "拾光采集器",
    version: packageJson.version,
    description: "右键图片发送到拾光桌面应用",
    permissions: [
      "contextMenus",
      "activeTab",
      "storage",
      "notifications",
      "scripting",
      "webNavigation",
    ],
    host_permissions: ["<all_urls>"],
    icons: {
      16: "icons/icon16.png",
      48: "icons/icon48.png",
      128: "icons/icon128.png",
    },
    action: {
      default_icon: {
        16: "icons/icon16.png",
        48: "icons/icon48.png",
        128: "icons/icon128.png",
      },
    },
    commands: {
      "open-panel": {
        description: "打开拾光采集面板",
      },
      "capture-visible": {
        description: "收藏当前可视范围截图",
      },
      "capture-element": {
        description: "开始元素截图",
      },
      "capture-area": {
        description: "开始区域截图",
      },
    },
  },
});
