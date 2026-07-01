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
import { seedAdmin } from "./auth.js";
import { startScheduler } from "./scheduler.js";
import { recoverOrphanTasks } from "./collector/taskRunner.js";

const app = Fastify({ logger: { level: "info" } });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true, ts: Date.now() }));

await app.register(authRoutes);
await app.register(sourceRoutes);
await app.register(vodRoutes);
await app.register(categoryRoutes);
await app.register(resolveRoutes);
await app.register(taskRoutes);
await app.register(metaRoutes);
await app.register(siteRoutes);

await seedAdmin();
// 服务启动回收上一进程遗留的僵尸任务（重启后内存执行器已丢失）
const orphans = await recoverOrphanTasks();
if (orphans.resumed || orphans.failed)
  app.log.info(`orphan tasks: resumed ${orphans.resumed}, failed ${orphans.failed}`);
startScheduler();

const PORT = Number(process.env.PORT) || 5150;
app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`video-cms server on :${PORT}`))
  .catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
