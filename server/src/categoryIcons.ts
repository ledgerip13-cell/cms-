export const CATEGORY_ICON_KEYS = [
  "action",
  "adventure",
  "anime",
  "calendar",
  "car",
  "cinema",
  "classic",
  "collection",
  "comedy",
  "comic",
  "commentary",
  "crime",
  "diamond",
  "documentary",
  "education",
  "fashion",
  "film",
  "folder",
  "food",
  "game",
  "grid",
  "health",
  "heart",
  "history",
  "hot",
  "kids",
  "live",
  "magic",
  "movie",
  "music",
  "mystery",
  "news",
  "play",
  "podcast",
  "radio",
  "ranking",
  "recommend",
  "romance",
  "science",
  "search",
  "series",
  "shortplay",
  "sport",
  "stage",
  "star",
  "travel",
  "trophy",
  "tv",
  "update",
  "variety",
  "war",
] as const;

const CATEGORY_ICON_KEY_SET = new Set<string>(CATEGORY_ICON_KEYS);

export function normalizeCategoryIcon(value: unknown, fallback = "folder") {
  const icon = String(value || "").trim();
  const custom = normalizeCustomSvgIcon(icon);
  if (custom) return custom;
  return CATEGORY_ICON_KEY_SET.has(icon) ? icon : fallback;
}

export function normalizeCustomSvgIcon(value: unknown) {
  const icon = String(value || "").trim();
  if (!icon.startsWith("svg:")) return "";
  const raw = icon.slice(4);
  let decoded = "";
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return "";
  }
  const markup = sanitizeSvgMarkup(decoded);
  return markup ? `svg:${encodeURIComponent(markup)}` : "";
}

export function inferCategoryIcon(name: unknown) {
  const text = String(name || "").trim();
  if (/动作|武打|功夫|格斗/.test(text)) return "action";
  if (/冒险|探险/.test(text)) return "adventure";
  if (/影院|院线/.test(text)) return "cinema";
  if (/电影|影片|片库/.test(text)) return "movie";
  if (/电视剧|剧集|连续剧|国产剧|日剧|韩剧|美剧|港剧|台剧|泰剧/.test(text)) return "tv";
  if (/综艺|真人秀|节目/.test(text)) return "variety";
  if (/动漫|动画|番剧/.test(text)) return "anime";
  if (/漫剧|漫画/.test(text)) return "comic";
  if (/短剧|短片|短视频/.test(text)) return "shortplay";
  if (/解说|讲解|预告/.test(text)) return "commentary";
  if (/喜剧|搞笑/.test(text)) return "comedy";
  if (/爱情|恋爱|言情/.test(text)) return "romance";
  if (/悬疑|推理|惊悚/.test(text)) return "mystery";
  if (/犯罪|刑侦|警匪/.test(text)) return "crime";
  if (/战争|军事/.test(text)) return "war";
  if (/奇幻|魔幻|玄幻|仙侠/.test(text)) return "magic";
  if (/体育|足球|篮球|赛事|电竞|比赛/.test(text)) return "sport";
  if (/纪录|记录/.test(text)) return "documentary";
  if (/音乐|演唱|MV|歌/.test(text)) return "music";
  if (/舞台|戏剧|晚会/.test(text)) return "stage";
  if (/新闻|资讯/.test(text)) return "news";
  if (/游戏/.test(text)) return "game";
  if (/少儿|儿童|亲子/.test(text)) return "kids";
  if (/教育|课堂|公开课/.test(text)) return "education";
  if (/科技|科学|科幻/.test(text)) return "science";
  if (/旅行|旅游|户外/.test(text)) return "travel";
  if (/美食|料理/.test(text)) return "food";
  if (/汽车|车/.test(text)) return "car";
  if (/健康|医疗|养生/.test(text)) return "health";
  if (/时尚|穿搭|美妆/.test(text)) return "fashion";
  if (/历史|人文/.test(text)) return "history";
  if (/直播/.test(text)) return "live";
  if (/电台|广播/.test(text)) return "radio";
  if (/播客|音频/.test(text)) return "podcast";
  if (/获奖|大奖|奥斯卡|金像|金马/.test(text)) return "trophy";
  if (/排行|榜/.test(text)) return "ranking";
  if (/热门|热播|爆款/.test(text)) return "hot";
  if (/推荐|猜你喜欢|为你/.test(text)) return "recommend";
  if (/更新|每日|今日|本周/.test(text)) return "calendar";
  if (/全部|分类|频道/.test(text)) return "grid";
  if (/搜索|查找/.test(text)) return "search";
  if (/播放|片单/.test(text)) return "play";
  if (/经典/.test(text)) return "classic";
  if (/高分|精选/.test(text)) return "star";
  if (/会员|VIP|专享/.test(text)) return "diamond";
  if (/收藏|喜欢/.test(text)) return "heart";
  if (/合集|专题|精选/.test(text)) return "collection";
  return "folder";
}

function sanitizeSvgMarkup(input: string) {
  const raw = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|foreignObject|iframe)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  const svgMatch = raw.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  const viewBox = safeSvgViewBox(svgMatch?.[1] || "");
  const inner = svgMatch ? svgMatch[2] : raw;
  const allowedTags = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
  const allowedAttrs = new Set([
    "d", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
    "width", "height", "points", "fill", "stroke", "stroke-width", "stroke-linecap",
    "stroke-linejoin", "fill-rule", "clip-rule",
  ]);
  const parts: string[] = [];
  const tagRe = /<\s*(path|rect|circle|ellipse|line|polyline|polygon)\b([^>]*)\/?\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(inner))) {
    const tag = match[1].toLowerCase();
    if (!allowedTags.has(tag)) continue;
    const attrs: string[] = [];
    const attrRe = /([a-zA-Z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let attr: RegExpExecArray | null;
    while ((attr = attrRe.exec(match[2] || ""))) {
      const name = attr[1].toLowerCase();
      const value = attr[3] ?? attr[4] ?? "";
      if (!allowedAttrs.has(name) || !safeSvgAttrValue(name, value)) continue;
      attrs.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
    }
    if (tag === "path" && !attrs.some((a) => a.startsWith("d="))) continue;
    parts.push(`<${tag}${attrs.length ? " " + attrs.join(" ") : ""}/>`);
  }
  const content = parts.join("").slice(0, 6000);
  return content ? `<svg viewBox="${viewBox}" fill="currentColor" stroke="none" aria-hidden="true">${content}</svg>` : "";
}

function safeSvgViewBox(attrs: string) {
  const match = attrs.match(/\bviewBox\s*=\s*("([^"]*)"|'([^']*)')/i);
  const value = String(match?.[2] ?? match?.[3] ?? "").trim();
  return /^-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?$/.test(value)
    ? value
    : "0 0 24 24";
}

function safeSvgAttrValue(name: string, value: string) {
  const v = String(value || "").trim();
  if (!v || /[<>]/.test(v) || /javascript:|data:|url\(|expression\(|on\w+=/i.test(v)) return false;
  if (["fill", "stroke"].includes(name)) {
    return /^(none|currentColor|#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/.test(v);
  }
  if (["stroke-linecap", "stroke-linejoin", "fill-rule", "clip-rule"].includes(name)) {
    return /^[a-zA-Z-]+$/.test(v);
  }
  return /^[0-9a-zA-Z.,+\-_\s()]+$/.test(v);
}
