// 本地源（转存产物独立线路）
// 转存完成后，把已下载到本地硬盘的集，作为一条独立的「本地源」Play 线路挂到该 vod 下。
//  - 金牌原线路保留（含 vod.archiveStatus=done 已下载标记，避免重复下载）。
//  - 本地源为单例 Source(driver="local")，默认 enabled=false 不对前台开放；后台启用即对前台放行。
//  - 播放走 flag=LOCAL_FLAG，resolve 直接服务 /api/jinpai-local 本地 HLS。
import { prisma } from "../db.js";

export const LOCAL_FLAG = "localm3u8";
export const LOCAL_SOURCE_DRIVER = "local";
export const LOCAL_SOURCE_NAME = "本地源";

// 查/建单例本地源；默认 enabled=false（默认不播放本地源）
export async function ensureLocalSource(): Promise<number> {
  const existing = await prisma.source.findFirst({ where: { driver: LOCAL_SOURCE_DRIVER }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.source.create({
    data: {
      name: LOCAL_SOURCE_NAME,
      apiUrl: "local://archive",
      driver: LOCAL_SOURCE_DRIVER,
      enabled: false, // 默认不对前台开放，后台启用后才提供本地源播放
      priority: 1, // 若启用，本地最快，排最前
      proxyMode: "direct",
      flag: LOCAL_FLAG,
    },
    select: { id: true },
  });
  return created.id;
}

export async function getLocalSourceId(): Promise<number | null> {
  const s = await prisma.source.findFirst({ where: { driver: LOCAL_SOURCE_DRIVER }, select: { id: true } });
  return s?.id ?? null;
}

// 转存完成 → upsert 本地源线路。episodes 为已成功归档的集(name+nid)，url 存 nid（resolve 拼本地路径）。
export async function upsertLocalPlay(
  vodId: number,
  sourceVodId: string,
  episodes: { name: string; nid: string }[]
): Promise<void> {
  const eps = episodes.filter((e) => e.nid).map((e) => ({ name: e.name || "", url: e.nid }));
  if (!eps.length) return;
  const sourceId = await ensureLocalSource();
  const key = { sourceId_sourceVodId_flag: { sourceId, sourceVodId, flag: LOCAL_FLAG } };
  const payload = {
    vodId,
    sourceId,
    flag: LOCAL_FLAG,
    sourceVodId,
    episodes: JSON.stringify(eps),
    epCount: eps.length,
    playKind: "hls",
    syncedAt: new Date(),
  };
  await prisma.play.upsert({ where: key, create: payload, update: payload });
}

// 取消转存 → 删除该 vod 的本地源线路
export async function removeLocalPlay(vodId: number): Promise<void> {
  const sourceId = await getLocalSourceId();
  if (!sourceId) return;
  await prisma.play.deleteMany({ where: { vodId, sourceId, flag: LOCAL_FLAG } });
}
