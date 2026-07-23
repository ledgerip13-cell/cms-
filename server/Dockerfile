FROM node:22-slim

WORKDIR /app

# Prisma 需要 openssl；备份中心需要 PostgreSQL 16 的 pg_dump。
RUN apt-get update \
  && apt-get install -y openssl ca-certificates curl gnupg \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
  && . /etc/os-release \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*
RUN npm i -g pnpm@10

# 依赖
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install

# Prisma 客户端
COPY prisma ./prisma
RUN pnpm exec prisma generate

# 源码构建
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

EXPOSE 5150
# 启动前 db push 建表(幂等)，再启动服务
CMD ["sh", "-c", "pnpm exec prisma db push --skip-generate --accept-data-loss && node dist/index.js"]
