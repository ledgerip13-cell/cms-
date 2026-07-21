// 回源代理路由：m3u8 重写 / key 代理 / TS 代理
// 仅当某源 proxyMode = key|proxy 时，resolve 才会下发 /api/hls-mp 入口(默认 direct 不经过这里)
import type { FastifyInstance } from "fastify";
import { Readable, Transform } from "node:stream";
import { signProxyToken, verifyProxyToken } from "../auth.js";
import {
  safeFetch,
  safeFetchStream,
  rewriteM3u8,
  refererOf,
  type ProxyMode,
  type RewriteCtx,
} from "../playProxy.js";

const TS_PROXY_TIMEOUT_MS = Math.max(3000, Number(process.env.TS_PROXY_TIMEOUT_MS) || 20000);
const TS_PROXY_MAX_BYTES = Math.max(1024 * 1024, Number(process.env.TS_PROXY_MAX_BYTES) || 64 * 1024 * 1024);
const TS_PROXY_MAX_CONCURRENCY = Math.max(1, Number(process.env.TS_PROXY_MAX_CONCURRENCY) || 24);
let activeTsProxyStreams = 0;

function acquireTsProxySlot() {
  if (activeTsProxyStreams >= TS_PROXY_MAX_CONCURRENCY) return null;
  activeTsProxyStreams += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeTsProxyStreams = Math.max(0, activeTsProxyStreams - 1);
  };
}

function limitBytes(maxBytes: number) {
  let bytes = 0;
  return new Transform({
    transform(chunk, _enc, cb) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) cb(new Error(`ts proxy body too large: ${bytes}`));
      else cb(null, chunk);
    },
  });
}

export default async function hlsProxyRoutes(app: FastifyInstance) {
  // m3u8 抓取+重写(含递归子 playlist)
  app.get("/api/hls-mp", async (req, reply) => {
    const token = String((req.query as any)?.t || "");
    let data: any;
    try { data = verifyProxyToken(token, "mp"); } catch { return reply.code(403).send("denied"); }
    const url = String(data.u || "");
    const mode = String(data.mode || "key") as ProxyMode;
    const ref = String(data.ref || refererOf(url));
    let m3u8: string;
    try {
      const r = await safeFetch(url, ref);
      m3u8 = r.buf.toString("utf-8");
    } catch (e: any) {
      return reply.code(502).send("fetch m3u8 failed");
    }
    if (!m3u8.includes("#EXTM3U")) return reply.code(502).send("not m3u8");
    const ctx: RewriteCtx = {
      mode,
      baseUrl: url,
      signKey: (u, r) => signProxyToken({ u, ref: r, kind: "key", mode }),
      signTs: (u, r) => signProxyToken({ u, ref: r, kind: "ts", mode }),
      signMp: (u, r) => signProxyToken({ u, ref: r, kind: "mp", mode }),
    };
    const rewritten = rewriteM3u8(m3u8, ctx);
    reply.header("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
    reply.header("Cache-Control", "public, max-age=60");
    return reply.send(rewritten);
  });

  // key 代理：服务器带 referer 取 16 字节 key 返回(解决跨域/防盗链/怪端口)
  app.get("/api/hls-key", async (req, reply) => {
    const token = String((req.query as any)?.t || "");
    let data: any;
    try { data = verifyProxyToken(token, "key"); } catch { return reply.code(403).send("denied"); }
    try {
      const r = await safeFetch(String(data.u || ""), String(data.ref || ""));
      reply.header("Content-Type", "application/octet-stream");
      reply.header("Cache-Control", "public, max-age=3600");
      return reply.send(r.buf);
    } catch {
      return reply.code(502).send("fetch key failed");
    }
  });

  // TS 代理(仅 proxy 模式)：服务器回源取分片流式转发(吃带宽)
  app.get("/api/hls-ts", async (req, reply) => {
    const token = String((req.query as any)?.t || "");
    let data: any;
    try { data = verifyProxyToken(token, "ts"); } catch { return reply.code(403).send("denied"); }
    const release = acquireTsProxySlot();
    if (!release) return reply.code(429).send("too many ts proxy streams");
    let upstream: Awaited<ReturnType<typeof safeFetchStream>> | null = null;
    try {
      upstream = await safeFetchStream(String(data.u || ""), String(data.ref || ""), {
        timeoutMs: TS_PROXY_TIMEOUT_MS,
        maxBytes: TS_PROXY_MAX_BYTES,
      });
      reply.header("Content-Type", upstream.contentType || "video/mp2t");
      reply.header("Cache-Control", "public, max-age=600");
      if (upstream.contentLength) reply.header("Content-Length", String(upstream.contentLength));
      const source = Readable.fromWeb(upstream.body as any);
      const limited = limitBytes(TS_PROXY_MAX_BYTES);
      const cleanup = () => {
        upstream?.clearTimeout();
        release();
      };
      req.raw.on("close", () => upstream?.abort());
      source.on("error", () => upstream?.abort());
      limited.on("error", () => upstream?.abort());
      limited.on("close", cleanup);
      limited.on("end", cleanup);
      return reply.send(source.pipe(limited));
    } catch (e: any) {
      upstream?.clearTimeout();
      upstream?.abort();
      release();
      const msg = String(e?.message || "");
      if (msg.includes("too large")) return reply.code(413).send("ts too large");
      return reply.code(502).send("fetch ts failed");
    }
  });
}
