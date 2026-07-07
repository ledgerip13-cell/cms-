// 采集驱动统一接口
// 设计原则：驱动只负责「把源站响应适配成本站标准 RawVod/ListResult/ClassItem」，
// 下游 upsertVod / parsePlay 等全链路对驱动无感，老源(maccms)行为字节级不变。
import type { RawVod, ListResult, ClassItem } from "../maccms.js";

export interface CollectorDriver {
  /** 驱动标识，与 Source.driver 对应 */
  name: string;
  /** 拉列表（分页）。typeId/keyword 可选，具体是否生效由驱动决定 */
  fetchList(
    apiUrl: string,
    page?: number,
    hours?: number,
    timeoutMs?: number,
    typeId?: string | number,
    keyword?: string
  ): Promise<ListResult>;
  /** 拉详情（含播放地址）。返回顺序不保证与 ids 一致，调用方按 vod_id 匹配 */
  fetchDetail(apiUrl: string, ids: (number | string)[], timeoutMs?: number): Promise<RawVod[]>;
  /** 拉分类树 */
  fetchClasses(apiUrl: string, timeoutMs?: number): Promise<ClassItem[]>;
  /** 按关键词搜索（不分页，取首页命中） */
  searchByKeyword(apiUrl: string, keyword: string, timeoutMs?: number): Promise<RawVod[]>;
}
