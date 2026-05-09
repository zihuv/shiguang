import { initXiaohongshu } from "./xiaohongshu";

const siteAdapters = [initXiaohongshu];

export function initSiteAdapters(collector) {
  for (const initAdapter of siteAdapters) {
    initAdapter(collector);
  }
}
