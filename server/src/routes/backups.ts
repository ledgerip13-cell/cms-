import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { authGuard } from "../auth.js";

const BACKUP_DIR = process.env.BACKUP_DIR || "/app/backups";
const BACKUP_NAME_RE = /^vcms-(full|selective)-\d{8}-\d{6}\.dump$/;

const BACKUP_PACKAGES: Record<string, { label: string; description: string; tables: string[] }> = {
  sources: {
    label: "采集源与分类映射",
    description: "采集源、站内分类、源分类映射",
    tables: ["Source", "Category", "SourceTypeMap"],
  },
  hlsClean: {
    label: "HLS 清洗数据",
    description: "清洗配置、策略、结果和广告指纹",
    tables: ["HlsCleanConfig", "HlsCleanPolicy", "HlsCleanResult", "HlsAdFingerprint"],
  },
  meta: {
    label: "元数据资产",
    description: "元数据配置、人物、别名、图片和人物关系",
    tables: ["MetaConfig", "Person", "VodPerson", "VodAlias", "VodSubType", "VodImage"],
  },
  vods: {
    label: "影片与播放线路",
    description: "影片主表、播放线路、图片、别名、子类型、人物关系",
    tables: ["Vod", "Play", "VodImage", "VodAlias", "VodSubType", "Person", "VodPerson"],
  },
  site: {
    label: "站点与运营配置",
    description: "站点配置、热门配置、VIP 等级和历史会员分组",
    tables: ["SiteConfig", "HotConfig", "VipLevel", "LegacyMemberGroup", "LegacyWebUserGroup"],
  },
};

const DEFAULT_EXCLUDED_TABLES = [
  "User",
  "WebUser",
  "LoginDevice",
  "UserRiskEvent",
  "UserBanLog",
  "SearchLog",
  "InviteCode",
  "AuditLog",
  "QcIssue",
  "AccessAudit",
  "IpLocationCache",
  "PlaybackErrorLog",
  "LoginLog",
  "RequestAccessLog",
  "UserFollow",
  "WatchHistory",
  "UserVodSkipPreference",
  "Comment",
  "UserRating",
  "VodRequest",
  "UserReport",
  "SiteMessage",
  "SiteMessageRead",
  "Danmaku",
];

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function safeBackupName(filename: string) {
  const name = path.basename(String(filename || ""));
  if (!BACKUP_NAME_RE.test(name)) throw new Error("非法备份文件名");
  return name;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

async function readMeta(file: string) {
  try {
    return JSON.parse(await fsp.readFile(`${file}.json`, "utf8"));
  } catch {
    return {};
  }
}

async function writeMeta(file: string, data: any) {
  await fsp.writeFile(`${file}.json`, JSON.stringify(data, null, 2));
}

function normalizePgDumpConnection(databaseUrl: string) {
  try {
    const url = new URL(databaseUrl);
    const schema = url.searchParams.get("schema") || "";
    url.searchParams.delete("schema");
    return { connection: url.toString(), schema };
  } catch {
    return { connection: databaseUrl, schema: "" };
  }
}

function runPgDump(outFile: string, tables: string[]) {
  const databaseUrl = process.env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("DATABASE_URL 未配置");
  const { connection, schema } = normalizePgDumpConnection(databaseUrl);
  const args = [
    connection,
    "-Fc",
    "--no-owner",
    "--no-acl",
    ...(schema ? ["--schema", schema] : []),
    "-f",
    outFile,
    ...tables.flatMap((table) => ["-t", `"${table}"`]),
  ];
  return new Promise<void>((resolve, reject) => {
    const child = spawn("pg_dump", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (buf) => {
      stderr = `${stderr}${buf.toString()}`.slice(-12000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `pg_dump exited ${code}`));
    });
  });
}

async function listBackups() {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const names = await fsp.readdir(BACKUP_DIR).catch(() => []);
  const rows = await Promise.all(names.filter((name) => BACKUP_NAME_RE.test(name)).map(async (name) => {
    const full = path.join(BACKUP_DIR, name);
    const st = await fsp.stat(full);
    const meta = await readMeta(full);
    return {
      filename: name,
      size: st.size,
      createdAt: meta.createdAt || st.mtime.toISOString(),
      kind: meta.kind || (name.includes("-full-") ? "full" : "selective"),
      packages: Array.isArray(meta.packages) ? meta.packages : [],
      packageLabels: Array.isArray(meta.packageLabels) ? meta.packageLabels : [],
      tables: Array.isArray(meta.tables) ? meta.tables : [],
      remark: String(meta.remark || ""),
    };
  }));
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export default async function backupRoutes(app: FastifyInstance) {
  app.register(async (admin) => {
    admin.addHook("preHandler", authGuard);

    admin.get("/api/admin/backups/packages", async () => ({
      packages: Object.entries(BACKUP_PACKAGES).map(([key, item]) => ({ key, ...item })),
      excludedTables: DEFAULT_EXCLUDED_TABLES,
    }));

    admin.get("/api/admin/backups", async () => ({ list: await listBackups(), dir: BACKUP_DIR }));

    admin.post("/api/admin/backups", async (req, reply) => {
      const body = (req.body as any) || {};
      const kind = body.kind === "selective" ? "selective" : "full";
      const selected = unique<string>((Array.isArray(body.packages) ? body.packages : []).map((x: any) => String(x)));
      const packages: string[] = kind === "selective" ? selected.filter((key) => BACKUP_PACKAGES[key]) : [];
      if (kind === "selective" && !packages.length) return reply.code(400).send({ ok: false, error: "请选择要导出的数据包" });
      const tables = kind === "selective" ? unique(packages.flatMap((key) => BACKUP_PACKAGES[key].tables)) : [];
      const createdAt = new Date().toISOString();
      const filename = `vcms-${kind}-${stamp()}.dump`;
      const file = path.join(BACKUP_DIR, filename);
      await fsp.mkdir(BACKUP_DIR, { recursive: true });
      try {
        await runPgDump(file, tables);
        const meta = {
          filename,
          kind,
          packages,
          packageLabels: packages.map((key) => BACKUP_PACKAGES[key].label),
          tables,
          excludedTables: kind === "full" ? [] : DEFAULT_EXCLUDED_TABLES,
          remark: String(body.remark || "").slice(0, 300),
          createdAt,
        };
        await writeMeta(file, meta);
        const st = await fsp.stat(file);
        return { ok: true, backup: { ...meta, size: st.size } };
      } catch (e: any) {
        await fsp.rm(file, { force: true }).catch(() => {});
        await fsp.rm(`${file}.json`, { force: true }).catch(() => {});
        return reply.code(500).send({ ok: false, error: String(e?.message || e).slice(0, 1000) });
      }
    });

    admin.patch("/api/admin/backups/:filename", async (req, reply) => {
      let name: string;
      try { name = safeBackupName((req.params as any).filename); } catch (e: any) { return reply.code(400).send({ ok: false, error: e.message }); }
      const file = path.join(BACKUP_DIR, name);
      try { await fsp.access(file); } catch { return reply.code(404).send({ ok: false, error: "备份不存在" }); }
      const meta = await readMeta(file);
      meta.remark = String((req.body as any)?.remark || "").slice(0, 300);
      await writeMeta(file, meta);
      return { ok: true };
    });

    admin.delete("/api/admin/backups/:filename", async (req, reply) => {
      let name: string;
      try { name = safeBackupName((req.params as any).filename); } catch (e: any) { return reply.code(400).send({ ok: false, error: e.message }); }
      const file = path.join(BACKUP_DIR, name);
      await fsp.rm(file, { force: true });
      await fsp.rm(`${file}.json`, { force: true });
      return { ok: true };
    });

    admin.get("/api/admin/backups/:filename/download", async (req, reply) => {
      let name: string;
      try { name = safeBackupName((req.params as any).filename); } catch (e: any) { return reply.code(400).send(e.message); }
      const file = path.join(BACKUP_DIR, name);
      try { await fsp.access(file); } catch { return reply.code(404).send("not found"); }
      reply.header("content-type", "application/octet-stream");
      reply.header("content-disposition", `attachment; filename="${name}"`);
      return reply.send(createReadStream(file));
    });
  });
}
