import { initXiaohongshu } from "./xiaohongshu";
import type { Collector } from "../types";

const siteAdapters = [initXiaohongshu];

export function initSiteAdapters(collector: Collector): void {
  for (const initAdapter of siteAdapters) {
    initAdapter(collector);
  }
}
