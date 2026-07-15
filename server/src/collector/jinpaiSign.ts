// 金牌影院(jinpai)系源站接口签名工具
//
// 来源：抓包逆向其前端 axios 请求拦截器(chunk 2844/5055)得到的签名函数 R。
// 算法：sign = SHA1( MD5( sortedParamStr + "&key=<signKey>&t=<ms>" ) )
//   - GET:  sortedParamStr = key 升序后 "k=v&k=v" 拼接（不含 key/t）
//   - POST: sortedParamStr = JSON.stringify(按key排序的对象)
//   - 空参数则 sortedParamStr 为空，raw 直接以 "key=...&t=..." 开头
// 三样本实测命中(2026-07-16)：detail/episode 接口 sign 完全一致。
//
// signKey 为其前端硬编码常量，极少变动。默认内置，Source.signKey 非空时覆盖，
// 或用环境变量 JINPAI_SIGN_KEY 覆盖（便于源改算法时热调，不必改代码）。
import crypto from "node:crypto";

export const DEFAULT_SIGN_KEY = "cb808529bae6b6be45ecfab29a4889bc";

export function resolveSignKey(sourceSignKey?: string | null): string {
  const fromSource = (sourceSignKey || "").trim();
  if (fromSource) return fromSource;
  const fromEnv = (process.env.JINPAI_SIGN_KEY || "").trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_SIGN_KEY;
}

export interface SignResult {
  t: string;
  sign: string;
}

/**
 * 生成 jinpai 接口签名头。
 * @param params 请求参数（GET query 或 POST body 对象）
 * @param signKey 签名密钥（传 Source.signKey；空则内置默认）
 * @param method  HTTP 方法，默认 GET
 */
export function signParams(
  params: Record<string, string | number> = {},
  signKey?: string | null,
  method: "GET" | "POST" = "GET"
): SignResult {
  const key = resolveSignKey(signKey);
  const t = Date.now().toString();
  const keys = Object.keys(params)
    .filter((k) => params[k] != null && params[k] !== "")
    .sort();
  const paramStr =
    method.toUpperCase() === "GET"
      ? keys.map((k) => `${k}=${params[k]}`).join("&")
      : keys.length
      ? JSON.stringify(Object.fromEntries(keys.map((k) => [k, params[k]])))
      : "";
  const raw = (paramStr ? paramStr + "&" : "") + `key=${key}&t=${t}`;
  const md5 = crypto.createHash("md5").update(raw).digest("hex");
  const sign = crypto.createHash("sha1").update(md5).digest("hex");
  return { t, sign };
}

/** 组装 jinpai API 请求头（含签名）。clientIp 传入则塞 X-Forwarded-For 让上游按客户端 IP 签 whip。 */
export function buildJinpaiHeaders(
  params: Record<string, string | number>,
  opts: { signKey?: string | null; deviceId: string; clientIp?: string | null; referer?: string; method?: "GET" | "POST" }
): Record<string, string> {
  const method = opts.method || "GET";
  const { t, sign } = signParams(params, opts.signKey, method);
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: opts.referer || "https://www.x8kb9k8.com/",
    Origin: "https://www.x8kb9k8.com",
    Accept: "application/json, text/plain, */*",
    "client-type": "1",
    deviceid: opts.deviceId,
    t,
    sign,
    authorization: "",
  };
  const ip = (opts.clientIp || "").trim();
  if (ip) headers["X-Forwarded-For"] = ip;
  return headers;
}
