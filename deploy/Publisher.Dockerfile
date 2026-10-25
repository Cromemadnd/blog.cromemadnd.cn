FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.11.1
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY quartz.config.yaml quartz.lock.json ./
COPY plugins ./plugins
COPY scripts/prepare-cloud.mjs ./scripts/prepare-cloud.mjs
RUN pnpm cloud:prepare
COPY . .
RUN pnpm cloud:build

ENV NODE_ENV=production TZ=Asia/Shanghai
CMD ["node", ".cloud/publisher.mjs", "watch"]
