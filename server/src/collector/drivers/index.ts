// 采集驱动工厂：按 Source.driver 分发。默认 maccms，行为与改造前完全一致。
import * as maccms from "../maccms.js";
import type { CollectorDriver } from "./types.js";
import { nbflixDriver } from "./nbflix.js";

// 现有 maccms 逻辑原样包成默认驱动（函数引用直接复用，零行为变化）
const maccmsDriver: CollectorDriver = {
  name: "maccms",
  fetchList: maccms.fetchList,
  fetchDetail: maccms.fetchDetail,
  fetchClasses: maccms.fetchClasses,
  searchByKeyword: maccms.searchByKeyword,
};

const registry: Record<string, CollectorDriver> = {
  maccms: maccmsDriver,
  nbflix: nbflixDriver,
};

export function getDriver(name?: string | null): CollectorDriver {
  const key = (name || "maccms").trim();
  return registry[key] || maccmsDriver;
}

// 供后台"新增源时下拉选驱动"用
export function listDrivers(): { value: string; label: string }[] {
  return [
    { value: "maccms", label: "苹果CMS (MacCMS 标准)" },
    { value: "nbflix", label: "iCloud 源 (nbflix/apollotec)" },
  ];
}

export type { CollectorDriver };
