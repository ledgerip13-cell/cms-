import type { FastifyReply, FastifyRequest } from "fastify";

const WINDOW_MS = 60_000;
const BLOCK_MS = 5 * 60_000;
const MAX_FAILURES = 5;

type Bucket = { count: number; resetAt: number; blockedUntil: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function clientIp(req: FastifyRequest) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim();
  return forwarded || req.ip || "unknown";
}

function keyFor(scope: string, req: FastifyRequest, username: string) {
  return `${scope}:${clientIp(req)}:${String(username || "").trim().toLowerCase()}`;
}

function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now && bucket.blockedUntil <= now) buckets.delete(key);
  }
}

export function rejectLimitedLogin(req: FastifyRequest, reply: FastifyReply, scope: string, username: string) {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(keyFor(scope, req, username));
  if (!bucket || bucket.blockedUntil <= now) return false;
  const retryAfter = Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000));
  reply.header("Retry-After", String(retryAfter)).code(429).send({ error: `登录太频繁，请 ${retryAfter} 秒后再试` });
  return true;
}

export function recordLoginFailure(req: FastifyRequest, scope: string, username: string) {
  const now = Date.now();
  const key = keyFor(scope, req, username);
  const prev = buckets.get(key);
  const bucket = prev && prev.resetAt > now
    ? prev
    : { count: 0, resetAt: now + WINDOW_MS, blockedUntil: 0 };
  bucket.count += 1;
  if (bucket.count >= MAX_FAILURES) bucket.blockedUntil = now + BLOCK_MS;
  buckets.set(key, bucket);
}

export function clearLoginFailures(req: FastifyRequest, scope: string, username: string) {
  buckets.delete(keyFor(scope, req, username));
}
