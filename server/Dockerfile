FROM node:22-slim

WORKDIR /app

# Prisma 需要 openssl（本地转存改为纯 Node 镜像 HLS，无需 ffmpeg）
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
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
