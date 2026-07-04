import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import sourceRoutes from "./routes/sources.js";
import vodRoutes from "./routes/vods.js";
import authRoutes from "./routes/auth.js";
import categoryRoutes from "./routes/categories.js";
import resolveRoutes from "./routes/resolve.js";
import taskRoutes from "./routes/tasks.js";
import metaRoutes from "./routes/meta.js";
import siteRoutes from "./routes/site.js";
import imgRoutes from "./routes/img.js";
import userRoutes from "./routes/users.js";
import hotRoutes from "./routes/hot.js";
import accessRoutes from "./routes/access.js";
import hlsCleanRoutes from "./routes/hlsClean.js";
import { seedAdmin } from "./auth.js";
import { seedVipLevels } from "./vipLevels.js";
import { startScheduler } from "./scheduler.js";
import { recoverOrphanTasks } from "./collector/taskRunner.js";

const app = Fastify({ logger: { level: "info" } });
const corsOrigins = (process.env.CORS_ORIGINS || "http://127.0.0.1:5151,http://localhost:5151,http://127.0.0.1:5152,http://localhost:5152")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
await app.register(cors, {
  origin(origin, cb) {
    if (!origin || corsOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
});

app.get("/health", async () => ({ ok: true, ts: Date.now() }));

await app.register(authRoutes);
await app.register(sourceRoutes);
await app.register(vodRoutes);
await app.register(categoryRoutes);
await app.register(resolveRoutes);
await app.register(taskRoutes);
await app.register(metaRoutes);
await app.register(siteRoutes);
await app.register(imgRoutes);
await app.register(userRoutes);
await app.register(hotRoutes);
await app.register(accessRoutes);
await app.register(hlsCleanRoutes);

await seedAdmin();
await seedVipLevels();
// 服务启动回收上一进程遗留的僵尸任务（重启后内存执行器已丢失）
const orphans = await recoverOrphanTasks();
if (orphans.resumed || orphans.failed || orphans.canceled)
  app.log.info(`orphan tasks: resumed ${orphans.resumed}, failed ${orphans.failed}, canceled ${orphans.canceled}`);
startScheduler();

const PORT = Number(process.env.PORT) || 5150;
app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`video-cms server on :${PORT}`))
  .catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
