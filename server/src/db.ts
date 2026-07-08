import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function ensurePerformanceIndexes() {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "Vod_name_trgm_idx" ON "Vod" USING gin (name gin_trgm_ops)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "Vod_actor_trgm_idx" ON "Vod" USING gin (actor gin_trgm_ops)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "Vod_director_trgm_idx" ON "Vod" USING gin (director gin_trgm_ops)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "Person_name_trgm_idx" ON "Person" USING gin (name gin_trgm_ops)`);
}
