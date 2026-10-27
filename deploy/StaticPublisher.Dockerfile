FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.11.1
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY quartz.config.yaml quartz.lock.json ./
COPY plugins ./plugins
COPY scripts/prepare-plugins.mjs ./scripts/prepare-plugins.mjs
RUN pnpm static:prepare
COPY . .

ENV NODE_ENV=production TZ=Asia/Shanghai
CMD ["node", "scripts/static-publisher.mjs", "watch"]
