// 线路探活：探测各线路首集可达性 → 标记死链 + 健康评分
import { prisma } from "../db.js";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";

// 探测单个 URL：返回 {ok, ms}
async function probeUrl(url: string, timeoutMs = 12000): Promise<{ ok: boolean; ms: number }> {
  const start = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // m3u8/分享页都用 GET（HEAD 常被拒），只读前几字节
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Range: "bytes=0-2047" },
    });
    const ok = res.status >= 200 && res.status < 400;
    // 读一点点确认真连通
    if (ok) await res.body?.cancel().catch(() => {});
    return { ok, ms: Date.now() - start };
  } catch {
    return { ok: false, ms: Date.now() - start };
  } finally {
    clearTimeout(t);
  }
}

// 由响应速度计算健康分（0-100）：可达 + 越快越高
function calcScore(alive: boolean, ms: number): number {
  if (!alive) return 0;
  if (ms < 500) return 100;
  if (ms < 1000) return 90;
  if (ms < 2000) return 75;
  if (ms < 4000) return 55;
  if (ms < 8000) return 35;
  return 15;
}

// 探测一批最久未检测的线路
export async function probeBatch(limit = 50) {
  const plays = await prisma.play.findMany({
    orderBy: [{ lastCheck: { sort: "asc", nulls: "first" } }],
    take: limit,
    include: { source: { select: { enabled: true } } },
  });
  let alive = 0, dead = 0;
  for (const p of plays) {
    if (!p.source.enabled) continue;
    let eps: { url: string }[] = [];
    try { eps = JSON.parse(p.episodes || "[]"); } catch {}
    const first = eps[0]?.url;
    if (!first) continue;
    const r = await probeUrl(first);
    const score = calcScore(r.ok, r.ms);
    await prisma.play.update({
      where: { id: p.id },
      data: { alive: r.ok, checkMs: r.ms, lastCheck: new Date(), score },
    });
    r.ok ? alive++ : dead++;
  }
  return { checked: alive + dead, alive, dead };
}
