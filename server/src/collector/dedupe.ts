// 去重指纹：识别"不同源的同一部片" → 合并为一条 Vod，多线路挂载
// 指纹 = 标准化片名 | 年份

// 标准化片名：去空格/标点/常见后缀噪音，全角转半角，繁简暂不处理
export function normalizeName(name: string): string {
  return (name || "")
    .trim()
    .replace(/[\s\u3000]+/g, "")
    // 去除画质/来源等噪音标记
    .replace(/(高清|超清|蓝光|1080P|720P|4K|HD|国语|粤语|日语|中字|抢先版|完结|会员版|TC|HR)/gi, "")
    // 去标点
    .replace(/[\p{P}\p{S}]/gu, "")
    .toLowerCase();
}

export function makeFingerprint(name: string, year?: string): string {
  const y = (year || "").match(/\d{4}/)?.[0] || "";
  return `${normalizeName(name)}|${y}`;
}
