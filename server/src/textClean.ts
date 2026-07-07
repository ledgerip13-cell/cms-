const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  copy: "(c)",
  gt: ">",
  hellip: "...",
  laquo: "\u300a",
  ldquo: "\"",
  lrm: "",
  lt: "<",
  mdash: "-",
  middot: "·",
  ndash: "-",
  nbsp: " ",
  quot: "\"",
  raquo: "\u300b",
  rdquo: "\"",
  reg: "(R)",
  rlm: "",
};

export function decodeHtmlEntities(value: unknown) {
  return String(value ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (entity, body: string) => {
    const key = body.toLowerCase();
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : entity;
  });
}

export function cleanText(value: unknown, limit = 0) {
  let text = decodeHtmlEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/[\u00a0\u2000-\u200b\u2028\u2029\u202f\u205f\u3000]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  if (limit > 0 && text.length > limit) text = text.slice(0, limit).trim();
  return text;
}

export function cleanVodTextFields<T extends Record<string, any>>(vod: T): T {
  return {
    ...vod,
    name: cleanText(vod.name),
    year: cleanText(vod.year),
    typeName: cleanText(vod.typeName),
    subType: cleanText(vod.subType),
    actor: cleanText(vod.actor),
    director: cleanText(vod.director),
    area: cleanText(vod.area),
    lang: cleanText(vod.lang),
    remarks: cleanText(vod.remarks),
    genres: cleanText(vod.genres),
    blurb: cleanText(vod.blurb, 2000),
    officialIntro: cleanText(vod.officialIntro, 2000),
  };
}
