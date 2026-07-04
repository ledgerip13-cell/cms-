import crypto from "node:crypto";
import { URL } from "node:url";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { prisma } from "../db.js";
import { resolveShareUrl } from "../collector/resolver.js";
import { probeTsBytes, type SegmentProfile } from "./tsProbe.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120";
const RANGE_BYTES = 320 * 1024;

export interface HlsStrategy {
  id: string;
  label: string;
  description: string;
}

export interface HlsPolicyDecision {
  enabled: boolean;
  dryRun: boolean;
  strategyId: string;
  strategyIds: string[];
  reason: string;
  minConfidence: number;
}

export interface HlsCleanRunOptions {
  playId: number;
  epIndex: number;
  strategyId?: string;
  strategyIds?: string[];
  dryRun?: boolean;
  minConfidence?: number;
}

interface Segment {
  index: number;
  uri: string;
  absUri: string;
  duration: number;
  start: number;
  end: number;
  group: number;
  tags: string[];
}

interface ParsedPlaylist {
  header: string[];
  tail: string[];
  segments: Segment[];
  isMaster: boolean;
}

interface MasterVariant {
  uri: string;
  absUri: string;
  bandwidth: number;
  resolution: string;
}

interface GroupInfo {
  id: number;
  start: number;
  end: number;
  duration: number;
  segments: Segment[];
  profile: SegmentProfile | null;
  profileKey: string;
  pathKey: string;
  fingerprint: string;
}

export const HLS_STRATEGIES: HlsStrategy[] = [
  {
    id: "discontinuity_profile_v1",
    label: "DISCONTINUITY + 编码画像",
    description: "按 discontinuity 分组，结合分辨率/帧率/PTS 突变识别拼接广告段",
  },
  {
    id: "foreign_ad_block_fingerprint_v1",
    label: "异源广告块指纹",
    description: "识别短时长、异源路径、PTS 重置的广告块，同一广告块出现在中插或尾部都会清洗",
  },
];

const DEFAULT_STRATEGY_IDS = ["discontinuity_profile_v1"];
const STRATEGY_ID_SET = new Set(HLS_STRATEGIES.map((s) => s.id));

export function normalizeHlsStrategyIds(value: any, fallback: string[] = DEFAULT_STRATEGY_IDS) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const ids = raw
    .map((x) => String(x || "").trim())
    .filter((x) => STRATEGY_ID_SET.has(x));
  const unique = [...new Set(ids)];
  return unique.length ? unique : [...fallback];
}

export function hlsStrategyChainKey(value: any, fallback: string[] = DEFAULT_STRATEGY_IDS) {
  return normalizeHlsStrategyIds(value, fallback).join(",");
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function hashText(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31
    || a === 192 && b === 168
    || a === 100 && b >= 64 && b <= 127
    || a >= 224;
}

function isUnsafeIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) {
    const h = ip.toLowerCase();
    return h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:");
  }
  return true;
}

async function assertSafeUrl(u: string): Promise<URL> {
  const x = new URL(u);
  if (x.protocol !== "http:" && x.protocol !== "https:") throw new Error("只支持 http/https 地址");
  const h = x.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) throw new Error("不允许访问本机地址");
  if (net.isIP(h)) {
    if (isUnsafeIp(h)) throw new Error("不允许访问内网地址");
    return x;
  }
  const records = await lookup(h, { all: true, verbatim: true });
  if (!records.length || records.some((r) => isUnsafeIp(r.address))) throw new Error("域名解析到不安全地址");
  return x;
}

async function fetchTextSafe(url: string, referer?: string, timeoutMs = 15000): Promise<string> {
  await assertSafeUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        ...(referer ? { Referer: referer } : {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRangeSafe(url: string, referer?: string, timeoutMs = 15000): Promise<Uint8Array> {
  await assertSafeUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Range: `bytes=0-${RANGE_BYTES - 1}`,
        ...(referer ? { Referer: referer } : {}),
      },
    });
    if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

function absUrl(uri: string, base: string) {
  return new URL(uri, base).toString();
}

function rewriteTagUris(line: string, base: string) {
  return line.replace(/URI="([^"]+)"/g, (_, uri: string) => {
    if (/^(data:|skd:|urn:)/i.test(uri)) return `URI="${uri}"`;
    return `URI="${absUrl(uri, base)}"`;
  });
}

function parsePlaylist(text: string, baseUrl: string): ParsedPlaylist {
  const rawLines = text.replace(/\r/g, "").split("\n").filter((l) => l.length > 0);
  const isMaster = rawLines.some((l) => l.startsWith("#EXT-X-STREAM-INF") || l.startsWith("#EXT-X-I-FRAME-STREAM-INF"));
  const header: string[] = [];
  const tail: string[] = [];
  const segments: Segment[] = [];
  let pending: string[] = [];
  let duration: number | null = null;
  let time = 0;
  let group = 0;
  let seenSegment = false;

  for (const line of rawLines) {
    if (line.startsWith("#EXT-X-DISCONTINUITY")) group++;
    if (line.startsWith("#EXTINF:")) {
      seenSegment = true;
      const n = Number(line.slice(8).split(",")[0]);
      duration = Number.isFinite(n) ? n : 0;
      pending.push(line);
      continue;
    }
    if (duration !== null && !line.startsWith("#")) {
      const abs = absUrl(line, baseUrl);
      const seg: Segment = {
        index: segments.length,
        uri: line,
        absUri: abs,
        duration,
        start: time,
        end: time + duration,
        group,
        tags: pending.map((x) => rewriteTagUris(x, baseUrl)),
      };
      segments.push(seg);
      time = seg.end;
      duration = null;
      pending = [];
      continue;
    }
    if (!seenSegment && !line.startsWith("#EXT-X-DISCONTINUITY")) header.push(rewriteTagUris(line, baseUrl));
    else pending.push(rewriteTagUris(line, baseUrl));
  }
  tail.push(...pending.map((x) => rewriteTagUris(x, baseUrl)));
  return { header, tail, segments, isMaster };
}

function readAttr(line: string, key: string) {
  const m = line.match(new RegExp(`${key}=([^,]+)`));
  return m ? m[1].replace(/^"|"$/g, "") : "";
}

function parseMasterVariants(text: string, baseUrl: string): MasterVariant[] {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const out: MasterVariant[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    let uri = "";
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].startsWith("#")) {
        uri = lines[j];
        break;
      }
      if (lines[j].startsWith("#EXT-X-STREAM-INF")) break;
    }
    if (!uri) continue;
    out.push({
      uri,
      absUri: absUrl(uri, baseUrl),
      bandwidth: Number(readAttr(line, "BANDWIDTH")) || 0,
      resolution: readAttr(line, "RESOLUTION"),
    });
  }
  return out;
}

function pickMasterVariant(variants: MasterVariant[]) {
  return [...variants].sort((a, b) => b.bandwidth - a.bandwidth)[0] || null;
}

async function resolveMediaManifest(url: string, text: string, referer?: string) {
  let currentUrl = url;
  let currentText = text;
  const chain: Array<{ url: string; variant?: MasterVariant }> = [{ url }];
  for (let depth = 0; depth < 4; depth++) {
    const parsed = parsePlaylist(currentText, currentUrl);
    if (!parsed.isMaster) return { manifestUrl: currentUrl, manifestText: currentText, chain };
    const variant = pickMasterVariant(parseMasterVariants(currentText, currentUrl));
    if (!variant) throw new Error("master playlist 未发现可用码率");
    currentUrl = variant.absUri;
    chain.push({ url: currentUrl, variant });
    currentText = await fetchTextSafe(currentUrl, referer || url);
  }
  throw new Error("master playlist 嵌套过深");
}

function segmentPathKey(seg: Segment) {
  try {
    const p = new URL(seg.absUri).pathname;
    const at = p.lastIndexOf("/");
    return at > 0 ? p.slice(0, at) : p;
  } catch {
    const p = seg.uri.split("?")[0];
    const at = p.lastIndexOf("/");
    return at > 0 ? p.slice(0, at) : p;
  }
}

function segmentFileName(seg: Segment) {
  try {
    const p = new URL(seg.absUri).pathname;
    return p.split("/").pop() || p;
  } catch {
    return seg.uri.split("?")[0].split("/").pop() || seg.uri;
  }
}

function pickWeightedPath(segments: Segment[]) {
  const scores = new Map<string, number>();
  for (const s of segments) {
    const key = segmentPathKey(s);
    scores.set(key, (scores.get(key) || 0) + Math.max(0.001, s.duration));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function groupFingerprint(segments: Segment[], pathKey: string) {
  const durations = segments.map((s) => Number(s.duration.toFixed(3)).toFixed(3)).join(",");
  const files = segments.map(segmentFileName).join("|");
  return hashText(`${pathKey}:${durations}:${files}`);
}

function groupsFromSegments(segments: Segment[]): GroupInfo[] {
  const by = new Map<number, Segment[]>();
  for (const s of segments) {
    if (!by.has(s.group)) by.set(s.group, []);
    by.get(s.group)!.push(s);
  }
  return [...by.entries()].map(([id, list]) => {
    const pathKey = pickWeightedPath(list);
    return {
      id,
      segments: list,
      start: list[0]?.start || 0,
      end: list[list.length - 1]?.end || 0,
      duration: list.reduce((sum, s) => sum + s.duration, 0),
      profile: null,
      profileKey: "",
      pathKey,
      fingerprint: groupFingerprint(list, pathKey),
    };
  });
}

function profileKey(p: SegmentProfile | null) {
  if (!p || !p.codec) return "";
  const fps = p.fps ? Math.round(p.fps * 100) / 100 : 0;
  return `${p.codec}:${p.width}x${p.height}:${fps}`;
}

async function probeGroups(groups: GroupInfo[], manifestUrl: string) {
  for (const g of groups) {
    const first = g.segments[0];
    if (!first) continue;
    try {
      const bytes = await fetchRangeSafe(first.absUri, manifestUrl);
      g.profile = probeTsBytes(bytes);
      g.profileKey = profileKey(g.profile);
    } catch {
      g.profile = null;
      g.profileKey = "";
    }
  }
}

function pickMainProfile(groups: GroupInfo[]) {
  const scores = new Map<string, number>();
  for (const g of groups) {
    if (!g.profileKey) continue;
    scores.set(g.profileKey, (scores.get(g.profileKey) || 0) + Math.max(1, g.duration));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function pickMainPath(groups: GroupInfo[]) {
  const scores = new Map<string, number>();
  for (const g of groups) {
    if (!g.pathKey) continue;
    scores.set(g.pathKey, (scores.get(g.pathKey) || 0) + Math.max(1, g.duration));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function detectProfileAdGroups(groups: GroupInfo[], mainKey: string) {
  const ads: Array<{ group: GroupInfo; confidence: number; reasons: string[] }> = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const prev = groups[i - 1];
    const next = groups[i + 1];
    const reasons: string[] = [];
    let score = 0;
    if (!mainKey || !g.profileKey || g.profileKey === mainKey) continue;
    if (g.duration < 5 || g.duration > 90) continue;
    score += 25; reasons.push("短时长异类分组");
    if (g.profileKey !== mainKey) { score += 35; reasons.push("编码画像不同于主片"); }
    if (prev?.profileKey === mainKey || next?.profileKey === mainKey) { score += 15; reasons.push("前后恢复主片画像"); }
    const pPts = prev?.profile?.pts;
    const gPts = g.profile?.pts;
    const nPts = next?.profile?.pts;
    if (typeof pPts === "number" && typeof gPts === "number" && gPts + 30 < pPts) {
      score += 20; reasons.push("PTS 重置");
    }
    if (typeof nPts === "number" && typeof gPts === "number" && nPts > gPts + g.duration + 100) {
      score += 10; reasons.push("广告后 PTS 回到正片时间线");
    }
    ads.push({ group: g, confidence: Math.min(100, score), reasons });
  }
  return ads;
}

function detectForeignAdBlockGroups(groups: GroupInfo[], mainPath: string) {
  const ads: Array<{ group: GroupInfo; confidence: number; reasons: string[] }> = [];
  const fingerprintCount = new Map<string, number>();
  for (const g of groups) fingerprintCount.set(g.fingerprint, (fingerprintCount.get(g.fingerprint) || 0) + 1);

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const prev = groups[i - 1];
    const next = groups[i + 1];
    const reasons: string[] = [];
    let score = 0;
    if (!mainPath || !g.pathKey || g.pathKey === mainPath) continue;
    if (g.duration < 5 || g.duration > 45) continue;
    if (g.segments.length < 2 || g.segments.length > 20) continue;

    score += 20; reasons.push("短时长广告块");
    score += 35; reasons.push("TS 路径不同于主片多数路径");
    score += 10; reasons.push("分片数量符合广告块");

    const pts = g.profile?.pts;
    if (typeof pts === "number" && pts < 30) {
      score += 25; reasons.push("PTS 从片头时间线重新开始");
    }
    if (prev?.pathKey === mainPath || next?.pathKey === mainPath) {
      score += 15; reasons.push("前后回到主片路径");
    }
    if ((fingerprintCount.get(g.fingerprint) || 0) > 1) {
      score += 10; reasons.push("同广告块在 m3u8 内重复出现");
    }
    ads.push({ group: g, confidence: Math.min(100, score), reasons });
  }
  return ads;
}

function cleanPlaylist(parsed: ParsedPlaylist, removeGroups: Set<number>, baseUrl: string) {
  const out: string[] = [];
  const push = (line: string) => {
    const prev = out[out.length - 1];
    if (line === "#EXT-X-DISCONTINUITY" && prev === "#EXT-X-DISCONTINUITY") return;
    out.push(line);
  };
  for (const line of parsed.header) push(line);
  let removedBefore = false;
  for (const seg of parsed.segments) {
    if (removeGroups.has(seg.group)) {
      removedBefore = true;
      continue;
    }
    if (removedBefore && out[out.length - 1] !== "#EXT-X-DISCONTINUITY") push("#EXT-X-DISCONTINUITY");
    for (const tag of seg.tags) push(tag);
    push(absUrl(seg.uri, baseUrl));
    removedBefore = false;
  }
  for (const line of parsed.tail) push(line);
  return out.join("\n") + "\n";
}

export async function ensureHlsCleanConfig() {
  return prisma.hlsCleanConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

export async function updateHlsCleanConfig(body: any) {
  await ensureHlsCleanConfig();
  const strategy = hlsStrategyChainKey(body.defaultStrategies ?? body.defaultStrategy);
  return prisma.hlsCleanConfig.update({
    where: { id: 1 },
    data: {
      enabled: Boolean(body.enabled),
      autoOnCollect: Boolean(body.autoOnCollect),
      autoQueueOnMiss: Boolean(body.autoQueueOnMiss),
      minConfidence: Math.max(0, Math.min(100, Number(body.minConfidence) || 80)),
      defaultStrategy: strategy,
      workerConcurrency: clampInt(body.workerConcurrency, 3, 1, 12),
      sourceConcurrency: clampInt(body.sourceConcurrency, 1, 1, 4),
    },
  });
}

export async function upsertHlsCleanPolicy(body: any) {
  const scope = String(body.scope || "");
  if (!["source", "category", "play"].includes(scope)) throw new Error("不支持的策略范围");
  const targetId = String(body.targetId || "").trim();
  if (!targetId) throw new Error("缺少目标");
  const mode = ["inherit", "enabled", "disabled", "dry_run"].includes(String(body.mode)) ? String(body.mode) : "inherit";
  const strategyId = hlsStrategyChainKey(body.strategyIds ?? body.strategyId, []);
  const targetKey = `${scope}:${targetId}`;
  return prisma.hlsCleanPolicy.upsert({
    where: { targetKey },
    update: { mode, strategyId, targetName: String(body.targetName || "") },
    create: { targetKey, scope, targetId, targetName: String(body.targetName || ""), mode, strategyId },
  });
}

export async function decideHlsClean(play: { id: number; sourceId: number; vod: { typeName: string } }): Promise<HlsPolicyDecision> {
  const cfg = await ensureHlsCleanConfig();
  const defaultStrategyIds = normalizeHlsStrategyIds(cfg.defaultStrategy);
  if (!cfg.enabled) {
    return {
      enabled: false,
      dryRun: false,
      strategyId: defaultStrategyIds.join(","),
      strategyIds: defaultStrategyIds,
      reason: "global_disabled",
      minConfidence: cfg.minConfidence,
    };
  }
  const keys = [`play:${play.id}`, `source:${play.sourceId}`, `category:${play.vod.typeName}`];
  const policies = await prisma.hlsCleanPolicy.findMany({ where: { targetKey: { in: keys } } });
  const byKey = new Map(policies.map((p) => [p.targetKey, p]));
  let enabled = true;
  let dryRun = false;
  let strategyIds = defaultStrategyIds;
  let reason = "global_enabled";
  for (const key of keys) {
    const p = byKey.get(key);
    if (!p) continue;
    if (p.strategyId) strategyIds = normalizeHlsStrategyIds(p.strategyId);
    if (p.mode === "disabled") { enabled = false; reason = `${p.scope}_disabled`; break; }
    if (p.mode === "dry_run") { dryRun = true; reason = `${p.scope}_dry_run`; }
    if (p.mode === "enabled") { enabled = true; reason = `${p.scope}_enabled`; }
  }
  return { enabled, dryRun, strategyId: strategyIds.join(","), strategyIds, reason, minConfidence: cfg.minConfidence };
}

async function analyzeManifest(
  manifestUrl: string,
  manifestText: string,
  minConfidence: number,
  strategyIds: string[],
  masterChain: any[] = [],
) {
  const parsed = parsePlaylist(manifestText, manifestUrl);
  if (parsed.isMaster) throw new Error("暂不清洗 master playlist，请清洗具体码率 media playlist");
  if (!parsed.segments.length) throw new Error("m3u8 未发现分片");
  const groups = groupsFromSegments(parsed.segments);
  await probeGroups(groups, manifestUrl);
  const mainKey = pickMainProfile(groups);
  const mainPath = pickMainPath(groups);
  const attempts: Array<{ strategyId: string; matched: number; maxConfidence: number }> = [];
  let matchedStrategyId = "";
  let detected: Array<{ group: GroupInfo; confidence: number; reasons: string[] }> = [];
  for (const strategyId of strategyIds) {
    const raw = strategyId === "foreign_ad_block_fingerprint_v1"
      ? detectForeignAdBlockGroups(groups, mainPath)
      : detectProfileAdGroups(groups, mainKey);
    const qualified = raw.filter((x) => x.confidence >= minConfidence);
    attempts.push({
      strategyId,
      matched: qualified.length,
      maxConfidence: raw.reduce((m, r) => Math.max(m, r.confidence), 0),
    });
    if (qualified.length) {
      matchedStrategyId = strategyId;
      detected = qualified;
      break;
    }
  }
  const byGroup = new Map<number, { group: GroupInfo; confidence: number; reasons: string[] }>();
  for (const item of detected) {
    const old = byGroup.get(item.group.id);
    if (!old || item.confidence > old.confidence) byGroup.set(item.group.id, item);
  }
  detected = [...byGroup.values()].sort((a, b) => a.group.start - b.group.start);
  const removeGroups = new Set(detected.map((x) => x.group.id));
  const cleanM3u8 = removeGroups.size ? cleanPlaylist(parsed, removeGroups, manifestUrl) : rewriteWholePlaylist(parsed, manifestUrl);
  const adRanges = detected.map((x) => ({
    start: Number(x.group.start.toFixed(3)),
    end: Number(x.group.end.toFixed(3)),
    duration: Number(x.group.duration.toFixed(3)),
    segments: x.group.segments.length,
    confidence: x.confidence,
    reason: x.reasons.join("、"),
  }));
  const evidence = {
    mediaUrl: manifestUrl,
    masterChain,
    strategyChain: strategyIds,
    matchedStrategy: matchedStrategyId,
    attempts,
    mainProfile: mainKey,
    mainPath,
    totalSegments: parsed.segments.length,
    totalGroups: groups.length,
    groups: groups.map((g) => ({
      id: g.id,
      start: Number(g.start.toFixed(3)),
      end: Number(g.end.toFixed(3)),
      duration: Number(g.duration.toFixed(3)),
      segments: g.segments.length,
      profile: g.profile,
      profileKey: g.profileKey,
      pathKey: g.pathKey,
      fingerprint: g.fingerprint,
      removed: removeGroups.has(g.id),
    })),
  };
  return {
    cleanM3u8,
    adRanges,
    evidence,
    confidence: adRanges.reduce((m, r) => Math.max(m, r.confidence), 0),
  };
}

function rewriteWholePlaylist(parsed: ParsedPlaylist, baseUrl: string) {
  const out: string[] = [...parsed.header];
  for (const seg of parsed.segments) {
    out.push(...seg.tags);
    out.push(absUrl(seg.uri, baseUrl));
  }
  out.push(...parsed.tail);
  return out.join("\n") + "\n";
}

export async function runHlsCleanForEpisode(opts: HlsCleanRunOptions) {
  const play = await prisma.play.findUnique({
    where: { id: opts.playId },
    include: { vod: { select: { id: true, typeName: true } }, source: { select: { id: true, name: true } } },
  });
  if (!play) throw new Error("播放线路不存在");
  const decision = await decideHlsClean({ id: play.id, sourceId: play.sourceId, vod: play.vod });
  const strategyIds = normalizeHlsStrategyIds(opts.strategyIds ?? opts.strategyId ?? decision.strategyIds);
  const strategyId = strategyIds.join(",");
  const dryRun = typeof opts.dryRun === "boolean" ? opts.dryRun : decision.dryRun;
  const minConfidence = opts.minConfidence ?? decision.minConfidence;

  let episodes: Array<{ name?: string; url?: string }> = [];
  try { episodes = JSON.parse(play.episodes || "[]"); } catch {}
  const ep = episodes[opts.epIndex];
  if (!ep?.url) throw new Error("播放集数不存在");

  let resolved = await resolveShareUrl(ep.url);
  if (!resolved.ok || !resolved.url || !/\.m3u8(\?|$)/i.test(resolved.url)) {
    const sourceUrlHash = hashText(resolved.url || ep.url);
    return prisma.hlsCleanResult.upsert({
      where: { playId_epIndex_sourceUrlHash_strategyId: { playId: play.id, epIndex: opts.epIndex, sourceUrlHash, strategyId } },
      update: {
        vodId: play.vodId, sourceId: play.sourceId, epName: ep.name || "", originUrl: ep.url,
        resolvedUrl: resolved.url || "", m3u8Hash: "", status: "failed", confidence: 0,
        adRanges: "[]", evidence: "{}", cleanM3u8: "", error: resolved.error || "非 m3u8 地址", checkedAt: new Date(),
      },
      create: {
        vodId: play.vodId, playId: play.id, sourceId: play.sourceId, epIndex: opts.epIndex, epName: ep.name || "",
        originUrl: ep.url, resolvedUrl: resolved.url || "", sourceUrlHash, m3u8Hash: "", strategyId,
        status: "failed", error: resolved.error || "非 m3u8 地址",
      },
    });
  }

  const sourceUrlHash = hashText(resolved.url);
  try {
    const rootManifestText = await fetchTextSafe(resolved.url, ep.url);
    const media = await resolveMediaManifest(resolved.url, rootManifestText, ep.url);
    const m3u8Hash = hashText(`${resolved.url}\n${rootManifestText}\n${media.manifestUrl}\n${media.manifestText}`);
    const analysis = await analyzeManifest(media.manifestUrl, media.manifestText, minConfidence, strategyIds, media.chain);
    const hasAds = analysis.adRanges.length > 0;
    const status = dryRun ? "dry_run" : hasAds ? "clean" : "no_ads";
    return prisma.hlsCleanResult.upsert({
      where: { playId_epIndex_sourceUrlHash_strategyId: { playId: play.id, epIndex: opts.epIndex, sourceUrlHash, strategyId } },
      update: {
        vodId: play.vodId, sourceId: play.sourceId, epName: ep.name || "", originUrl: ep.url, resolvedUrl: resolved.url,
        m3u8Hash, status, confidence: analysis.confidence, adRanges: JSON.stringify(analysis.adRanges),
        evidence: JSON.stringify(analysis.evidence), cleanM3u8: analysis.cleanM3u8, error: "", checkedAt: new Date(),
      },
      create: {
        vodId: play.vodId, playId: play.id, sourceId: play.sourceId, epIndex: opts.epIndex, epName: ep.name || "",
        originUrl: ep.url, resolvedUrl: resolved.url, sourceUrlHash, m3u8Hash, strategyId, status,
        confidence: analysis.confidence, adRanges: JSON.stringify(analysis.adRanges), evidence: JSON.stringify(analysis.evidence),
        cleanM3u8: analysis.cleanM3u8,
      },
    });
  } catch (e: any) {
    return prisma.hlsCleanResult.upsert({
      where: { playId_epIndex_sourceUrlHash_strategyId: { playId: play.id, epIndex: opts.epIndex, sourceUrlHash, strategyId } },
      update: {
        vodId: play.vodId, sourceId: play.sourceId, epName: ep.name || "", originUrl: ep.url, resolvedUrl: resolved.url,
        m3u8Hash: "", status: "failed", confidence: 0, adRanges: "[]", evidence: "{}", cleanM3u8: "",
        error: e?.message || String(e), checkedAt: new Date(),
      },
      create: {
        vodId: play.vodId, playId: play.id, sourceId: play.sourceId, epIndex: opts.epIndex, epName: ep.name || "",
        originUrl: ep.url, resolvedUrl: resolved.url, sourceUrlHash, m3u8Hash: "", strategyId,
        status: "failed", error: e?.message || String(e),
      },
    });
  }
}

export async function findCleanResultForPlayback(play: { id: number; sourceId: number; vod: { typeName: string } }, resolvedUrl: string) {
  const decision = await decideHlsClean(play);
  if (!decision.enabled || decision.dryRun) return null;
  const result = await prisma.hlsCleanResult.findFirst({
    where: {
      playId: play.id,
      sourceUrlHash: hashText(resolvedUrl),
      strategyId: decision.strategyIds.join(","),
      status: "clean",
      confidence: { gte: decision.minConfidence },
    },
    orderBy: { checkedAt: "desc" },
  });
  return result?.cleanM3u8 ? result : null;
}
