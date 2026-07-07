// iCloud 分享链服务端解析（方案A 的服务端一次性场景专用）
// 用途：采集时把 iCloud 分享链（封面/字幕）解析成真实直链再下载入库。
// 注意：视频播放不走这里（视频必须由观众浏览器解析，避免解析请求汇聚本站IP被封）；
//       封面/字幕是采集时一次性、低频操作，服务端解析安全。
const CK = {
  ckjsBuildVersion: "1954c05c4f41058728b542451db280c466a18f51",
  ckjsVersion: "2.6.4",
  clientBuildNumber: "2511Hotfix24",
  clientMasteringNumber: "2511Hotfix24",
};

export function isICloudShareUrl(url: unknown): boolean {
  return typeof url === "string" && url.includes("/iclouddrive/");
}

function parseShortGUID(url: string): { guid: string; filename: string } | null {
  const m = url.match(/\/iclouddrive\/([a-zA-Z0-9_-]+)(?:[#/].*|$)/);
  if (!m) return null;
  let filename = "";
  try {
    const u = new URL(url);
    if (u.hash) filename = decodeURIComponent(u.hash.substring(1));
    else {
      const parts = u.pathname.split("/");
      const last = parts[parts.length - 1];
      if (last && last !== m[1]) filename = decodeURIComponent(last);
    }
  } catch { /* ignore */ }
  return { guid: m[1], filename };
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 解析 iCloud 分享链 → 真实可下载直链（cvws.icloud-content.com，带 ~15 分钟签名，须立即使用）
export async function resolveICloudDirect(shareUrl: string, timeoutMs = 15000): Promise<string> {
  const p = parseShortGUID(shareUrl);
  if (!p) throw new Error("非 iCloud 分享链");
  const api =
    "https://ckdatabasews.icloud.com/database/1/com.apple.cloudkit/production/public/records/resolve" +
    `?ckjsBuildVersion=${CK.ckjsBuildVersion}&ckjsVersion=${CK.ckjsVersion}&clientId=${uuid().toLowerCase()}` +
    `&clientBuildNumber=${CK.clientBuildNumber}&clientMasteringNumber=${CK.clientMasteringNumber}`;
  const res = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ shortGUIDs: [{ value: p.guid }] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`CloudKit HTTP ${res.status}`);
  const data: any = await res.json();
  const fc = data?.results?.[0]?.rootRecord?.fields?.fileContent;
  let dl: string | undefined = fc?.value?.downloadURL;
  if (!dl) throw new Error("解析失败（分享可能已失效）");
  if (dl.includes("${f}") && p.filename) dl = dl.replace("${f}", encodeURIComponent(p.filename));
  return dl;
}
