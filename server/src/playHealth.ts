import { prisma } from "./db.js";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function healthScore(successCount: number, failureCount: number, avgResponseMs: number, ok: boolean) {
  const total = Math.max(1, successCount + failureCount);
  const successRate = successCount / total;
  const failPenalty = Math.min(55, failureCount * 8);
  const speedPenalty = avgResponseMs > 0 ? Math.min(25, Math.max(0, (avgResponseMs - 600) / 180)) : 0;
  const freshnessBonus = ok ? 8 : -10;
  return clampScore(95 * successRate - failPenalty - speedPenalty + freshnessBonus);
}

export async function recordPlayHealth(playId: unknown, ok: boolean, opts: { ms?: number; reason?: string } = {}) {
  const id = Number(playId);
  if (!Number.isInteger(id) || id <= 0) return;
  const play = await prisma.play.findUnique({
    where: { id },
    select: {
      playSuccessCount: true,
      playFailureCount: true,
      avgResponseMs: true,
    },
  }).catch(() => null);
  if (!play) return;
  const successCount = Number(play.playSuccessCount || 0) + (ok ? 1 : 0);
  const failureCount = Number(play.playFailureCount || 0) + (ok ? 0 : 1);
  const ms = Math.max(0, Math.round(Number(opts.ms) || 0));
  const avgResponseMs = ms > 0
    ? Math.round(((Number(play.avgResponseMs || 0) * Math.max(0, successCount + failureCount - 1)) + ms) / Math.max(1, successCount + failureCount))
    : Number(play.avgResponseMs || 0);
  const score = healthScore(successCount, failureCount, avgResponseMs, ok);
  await prisma.play.update({
    where: { id },
    data: {
      alive: ok ? true : undefined,
      score,
      checkMs: ms || undefined,
      avgResponseMs,
      playSuccessCount: successCount,
      playFailureCount: failureCount,
      lastSuccessAt: ok ? new Date() : undefined,
      lastFailureAt: ok ? undefined : new Date(),
      healthReason: String(opts.reason || (ok ? "resolve_ok" : "playback_error")).slice(0, 200),
    },
  }).catch(() => {});
}
