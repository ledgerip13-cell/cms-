// 统一分类体系：把各源碎片化的原始分类名归一到 10 个大类（单一事实源）
// 采集入库、存量回填、映射自动归位 全部走这套规则，保证前后台一致。

export interface CatDef { name: string; slug: string; sort: number }

export const CATEGORIES: CatDef[] = [
  { name: "电影", slug: "movie", sort: 10 },
  { name: "电视剧", slug: "tv", sort: 20 },
  { name: "综艺", slug: "show", sort: 30 },
  { name: "动漫", slug: "anime", sort: 40 },
  { name: "短剧", slug: "short", sort: 50 },
  { name: "漫剧", slug: "comic", sort: 60 },
  { name: "解说", slug: "commentary", sort: 70 },
  { name: "体育", slug: "sport", sort: 80 },
  { name: "纪录片", slug: "doc", sort: 90 },
  { name: "其他", slug: "other", sort: 100 },
];

// 明确的地区剧集集合（结尾为“剧”但属电视剧，非短剧农场）
const TV_DRAMA = new Set([
  "国产剧", "日本剧", "美国剧", "欧美剧", "韩国剧", "香港剧", "台湾剧", "海外剧",
  "泰剧", "泰国剧", "连续剧", "日剧", "美剧", "韩剧", "港剧", "陆剧", "内地剧",
  "新加坡剧", "马来剧", "英剧", "电视剧",
]);

// 短剧农场类型关键词
const SHORT_KW = [
  "短剧", "爽文", "爽剧", "穿越", "重生", "闪婚", "离婚", "总裁", "赘婿", "战神",
  "脑洞", "恋爱", "言情", "仙侠", "都市", "民国", "逆袭", "神医", "娇妻", "霸总",
  "甜宠", "虐恋", "年代", "女恋", "重生",
];

// 把一个原始分类名归类到大类名
export function classifyType(raw: string | null | undefined): string {
  const n = (raw || "").trim();
  if (!n || n === "未分类" || n === "其他" || n === "福利") return "其他";
  const has = (...ks: string[]) => ks.some((k) => n.includes(k));

  if (has("解说", "预告")) return "解说";
  if (has("足球", "篮球", "网球", "斯诺克", "台球", "赛事", "体育", "电竞")) return "体育";
  if (has("纪录", "记录")) return "纪录片";
  if (has("漫剧")) return "漫剧";               // AI漫剧 / 漫剧
  if (has("动漫", "动画")) return "动漫";        // 动画片 / 动画电影 → 动漫
  if (has("综艺")) return "综艺";
  if (TV_DRAMA.has(n)) return "电视剧";
  if (n === "短剧大全" || SHORT_KW.some((k) => n.includes(k))) return "短剧";
  if (n.endsWith("片") || has("电影", "伦理", "倫理", "理论", "Netflix")) return "电影";
  if (n.includes("剧")) return "电视剧";         // 兜底：其余含“剧”归电视剧
  return "其他";
}
