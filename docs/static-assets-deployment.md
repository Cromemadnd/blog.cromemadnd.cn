# Quartz 增量发布到 Workers Static Assets

这套方案在自建服务器上读取 LiveSync 文件镜像，缓存 Markdown 解析结果，生成完整静态快照，再交给 Wrangler 按内容哈希上传缺失的资产并部署新版本。访客直接访问 Cloudflare，无需回源到自建服务器；不依赖 R2、D1 或 Tunnel。

```text
手机 Obsidian → Self-hosted LiveSync → CouchDB
                                       ↓
                                LiveSync Bridge
                                       ↓
                           只包含公开内容的文件镜像
                                       ↓
                           Static Publisher（Node.js）
                           解析缓存 → 完整静态快照
                                       ↓
                           Wrangler → Static Assets
                                       ↓
                                    浏览器
```

## 部署入口

新入口为 `apps/static/wrangler.jsonc`，Worker 名称是 `cromemadnd-blog-static`，没有自定义 Worker 脚本、数据库或桶绑定。默认只开放 `workers.dev`，不修改 `blog.cromemadnd.cn` 的域名映射。本次已创建并验证的预览地址是 [cromemadnd-blog-static.905509028.workers.dev](https://cromemadnd-blog-static.905509028.workers.dev)。

仓库只保留原生 Quartz SSG 和 Static Assets 发布链路。旧 SSR、D1/R2 发布器、数据库迁移及其配置已移除，需要查看旧实现时请使用 Git 历史。此次清理不会删除已存在的 Cloudflare Worker、数据库或桶。上传范围仅为构建输出快照，不包含仓库源码。

## 本地构建与验证

要求 Node.js >= 22.13、pnpm 10.11.1、Git。正式容器固定使用 Node.js 24。所有命令均在仓库根目录执行。

```bash
pnpm install --frozen-lockfile
pnpm static:prepare
pnpm static:check
pnpm static:test
pnpm static:build
pnpm static:deploy --dry-run
pnpm static:preview
```

`static:prepare` 使用锁定插件准备脚本 `scripts/prepare-plugins.mjs`：本地 fork 建立链接，远端插件按 `quartz.lock.json` 的 commit 获取；不会覆盖不匹配的已有插件缓存。修改本地插件源码后，先运行例如 `node plugins/build.mjs explorer` 更新其 dist，确认类型声明仍保留，再重启发布器。

`static:build` 默认读取 `content/`，不访问 Cloudflare；产物与缓存写入 `.static-publisher/`。`snapshot` 是指向最新完整输出的符号链接。`static:preview` 用真实本地 workerd 提供该目录，不需要 Cloudflare 凭据。不要把 `snapshot/` 当作 Quartz 的可变构建目录。

分享图生成已在 `quartz.config.yaml` 中默认禁用，页面使用统一的 `static/og-image.png`。如果以后重新启用插件，可以仅在本地临时跳过生成：

```bash
STATIC_SKIP_OG_IMAGES=true pnpm static:build
```

仅在手工重新启用 OG-image 插件时，首次生成才可能下载字体和表情资源。原生 `pnpm quartz build` 和 `pnpm quartz build --watch` 不受新发布器影响。

## 首次发布到独立 Worker

工作站已有 Wrangler OAuth 登录时可以直接使用，否则先登录：

```bash
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm static:build
pnpm static:deploy --dry-run
pnpm static:deploy
```

首次 `static:deploy` 会创建配置中指定的 Worker。后续命令只部署上一次成功构建的快照，不自动重新构建。请确认 Wrangler 输出的 Worker 名称和域名是新的静态入口。

一次发布仍有清单检查、上传和版本部署过程；增量上传不等于立即修改线上文件。不要预先假设固定的秒级上线时间，应分别记录同步、构建与部署耗时。

## 服务器凭据与配置

```bash
cp .env.static.example .env.static
```

服务器填写：

```dotenv
CLOUDFLARE_ACCOUNT_ID=你的账号ID
CLOUDFLARE_API_TOKEN=该账号的部署令牌
STATIC_SOURCE=/srv/blog/public-mirror
STATIC_STATE_DIR=/srv/blog/publisher-state
STATIC_DEBOUNCE_MS=2000
STATIC_RETRY_MS=10000
STATIC_SCAN_MS=30000
STATIC_SKIP_OG_IMAGES=false
```

令牌使用该账号的 Workers Scripts 编辑权限。默认不需要 D1、R2、DNS 或域名路由写入权限。不要把工作站的 OAuth 登录文件打进容器，也不要提交 `.env.static`。工作站使用已有 OAuth 时可不创建 `.env.static`；若创建了，删除空的认证字段或填入有效值。

`STATIC_SOURCE` 与 `STATIC_STATE_DIR` 必须是互不嵌套的独立目录。服务器运行目录应是仓库根目录；状态目录必须持久化并支持 SQLite 文件锁。发布器只读取源镜像，不回写笔记。

已经有可靠的文件镜像时，直接启动：

```bash
pnpm static:watch
```

只在本地连续构建、禁止部署：

```bash
pnpm static:watch --no-deploy
```

普通文章修改不需要重启。修改 Quartz 配置、插件、组件、样式或依赖后必须重启发布器，以重新打包编译器并更换缓存命名空间。运行期间检测到 YAML 配置变化会暂停构建并提示重启，避免混用配置。

## 使用 Compose 接入 LiveSync

Compose 使用项目名 `quartz-static-publisher`。如果曾运行旧发布服务，迁移时停止旧发布进程并保留其数据卷；本方案的 Bridge 先完成自己的首次同步。

```bash
cp deploy/livesync/config.example.json deploy/livesync/config.json
```

在此配置中填写 CouchDB 连接、用户名密码及与 Vault 匹配的 E2EE、路径混淆参数。`baseDir` 应限制到专门公开的目录，例如 `blog/`。不同 LiveSync 加密版本的参数以 [LiveSync Bridge 文档](https://github.com/vrtmrz/livesync-bridge) 为准；独立 ID key 等设置必须与实际库一致。

Bridge 的 storage 路径保持 `data/vault/`，对应容器内 `/app/data/vault`。Bridge 本身支持双向同步，Publisher 将镜像卷只读挂载。

```bash
docker compose -f deploy/compose.static.yaml build
docker compose -f deploy/compose.static.yaml up -d bridge
docker compose -f deploy/compose.static.yaml logs -f bridge
```

首次同步结束后检查文件数量与内容：

```bash
docker compose -f deploy/compose.static.yaml exec bridge ls /app/data/vault
```

确认正确后再创建准备标记并启动 Publisher：

```bash
docker compose -f deploy/compose.static.yaml exec bridge touch /app/data/.publisher-ready
docker compose -f deploy/compose.static.yaml up -d publisher
docker compose -f deploy/compose.static.yaml logs -f publisher
```

Compose 自动设置 `STATIC_SOURCE=/vault-data/vault`、`STATIC_STATE_DIR=/state`、`STATIC_READY_FILE=/vault-data/.publisher-ready`，覆盖 `.env.static` 中的主机路径。准备标记在镜像外，不会同步回 Vault。配置文件和令牌均通过运行时挂载或环境变量提供，不进入镜像。

如果重新初始化 Bridge 镜像，先停止 Publisher 并移除准备标记，待同步完整后再恢复。空库和零可发布文章会被拒绝，但一个非空的、尚未同步完整的库不能仅靠数量判断，因此首次人工确认仍然必要。

升级代码后：

```bash
docker compose -f deploy/compose.static.yaml build publisher
docker compose -f deploy/compose.static.yaml up -d publisher
```

不要使用 `down --volumes` 作为日常重启方式，它会删除文件镜像、Bridge 同步状态和 Publisher 缓存。

## 增量范围与一致性

- Markdown 和 HTML AST 分别缓存到 SQLite。普通正文修改只重新解析变化的文章；新增、删除、重命名改变文件命名空间时保守失效；别名变化会使相关 HTML 转换缓存失效。
- 缓存只保存渲染前的 AST，每批使用独立副本，避免转引与页面渲染污染后续构建。
- 页面、目录、标签、反向链接、搜索索引、RSS、站点地图等输出保守地完整生成，保证嵌入与全站元数据更新。组件资源在进程内复用；默认禁用 OG 图片生成，重新启用时仍按页面元数据缓存。这是“增量解析 + 完整输出快照”，不保证只重新渲染受影响的单个页面。
- 输入先复制为快照并检查变化，输出写入全新目录；解析、插件输出、大小检查或快照检查失败时保留上一版。删除、重命名、草稿和别名移除不会沿用旧输出目录里的残留文件。
- 每次向 Cloudflare 提供完整站点清单；由 Wrangler 与平台决定需要上传的资产。通常只上传变化的文件，平台要求补传时也会自动补传，不依赖本地猜测远端是否存在。
- 部署串行执行。部署期间允许下一批构建，待发布版本合并为最新完整快照；不会并发发布导致旧版本覆盖新版本。
- 上传失败后自动重试，不要求再编辑一次笔记；重启会先检查当前源并重新构建，再提交最新状态，避免抢先发布过时的待发布快照。
- 默认等待 2 秒合并编辑，每 30 秒按内容哈希扫描一次，弥补遗漏的文件系统事件。
- 使用 SQLite 的 OS 锁保证同一状态目录只有一个发布进程。崩溃后锁自动释放，无需删除 PID 文件。

默认继承 Quartz 的草稿过滤、`ignorePatterns` 和 `unlisted`。`unlisted` 页面仍可通过 URL 访问。附件不是逐篇授权的资源：镜像应只包含准备公开的内容。

镜像没有可靠 Git 历史，日期优先使用 frontmatter 的 `created`、`modified`、`published`，缺省使用镜像源文件时间。虚拟页面使用稳定的源时间，避免每次构建因当前时间不同而产生无效上传。

## 缓存与文件限制

输出自动生成 `_headers`：

```text
/*
  Cache-Control: public, max-age=0, must-revalidate
```

直接由 Static Assets 提供文件，不增加 Worker Cache API 缓存层。浏览器可保存内容，但再次使用时需通过 ETag 验证；提供 ETag 的资源在内容未变时可返回 304，同路径图片变化也可更新。线上 HTML 如果经过平台内容转换可能不带 ETag，此时浏览器重新下载 HTML，仍遵循重新验证策略。部署新资产版本无需编写手动清缓存逻辑。不要另加覆盖此策略的强制长缓存规则或离线 Service Worker。

源附件不能占用 `_headers`、`_redirects`、`.assetsignore`、`_worker.js` 等宿主配置名称。发布前检查单文件不超过 25 MiB，文件总数按免费计划保守限制为 20,000。大于上限的附件需要单独的文件托管服务，不能通过拆入 D1 来解决。

已打开的页面不会自动刷新；此版本保证刷新/重新请求能看到新发布的内容，没有实现页面版本轮询。

参考：[Static Assets](https://developers.cloudflare.com/workers/static-assets/)、[增量资产上传](https://developers.cloudflare.com/workers/static-assets/direct-upload/)、[响应头与 ETag](https://developers.cloudflare.com/workers/static-assets/headers/)。

## 正式域名切换与回滚

先在新 `workers.dev` 地址验证首页、中文路径、目录、标签、搜索、图片、草稿过滤、404 和缓存响应。正式切换时将 `blog.cromemadnd.cn` 的 Worker 自定义域名或路由转移到新 Worker；如果当前属于旧 Worker，需要先解除旧映射。此次代码改造默认不执行该切换。

长期使用自定义域名时，可在静态 Wrangler 配置加入相应 `routes`（例如自定义域名配置），并让服务器令牌具备必要的域名管理权限；或者通过控制台管理，并统一后续 Wrangler 部署配置，避免控制台与配置文件互相覆盖。

查看与回滚静态版本：

```bash
pnpm exec wrangler versions list --config apps/static/wrangler.jsonc
pnpm exec wrangler rollback 目标版本ID --config apps/static/wrangler.jsonc
```

回滚前停止 watcher，避免下一批更新再次发布源镜像的最新内容。域名迁移需要回退时，可将映射恢复到尚未删除的旧线上 Worker。旧源码不再作为日常入口保留，需要恢复时从 Git 历史建立独立工作目录，避免混入当前发布链路。

## 日志、磁盘与验证范围

Publisher 输出 JSON 事件：`watching`、`built`、`build-failed`、`published`、`publish-failed`。`built` 的 `parsed`、`transformed`、`reused` 和 `ms` 可用于确认缓存是否生效；`ioMs` 记录扫描、复制、复核和输出清单耗时，`timingsMs` 与 `emitterMs` 记录编译阶段和各输出插件耗时。`ms` 包含源扫描，但不包含进程启动和运行时打包；Wrangler 输出实际上传文件数量和部署结果。`latest.json` 记录最后成功构建，`desired.json` 记录待发布版本，`deployed.json` 记录本发布器最后成功提交的版本；手动控制台部署不会自动同步回这些本地记录。

正常构建会清理不再使用的输出快照，保留最新、待发布及已发布的快照，上传进行中暂缓清理。SQLite 解析缓存和 OG 缓存不会自动按历史版本淘汰，应监控磁盘。需要清理时先停 Publisher，可删除 `parse.sqlite`、`og-cache/`、`component-resources/` 后重新构建；不要删除源镜像或正在上传的输出。进程强制终止留下的 `inputs/` 和 `quartz/.quartz-cache/static-*` 可以在停机后清理。

本次验证包括：真实 Quartz 插件的缓存复用、嵌入更新、别名移除、草稿/隐藏文章、删除/重命名、进程重启、监听重试、部署队列合并与串行、快照完整性、文件大小和配置注入防护；同时验证 Quartz 的路径、转引、页面资源及搜索等原生回归测试。本地 workerd 验证了 HTML、JSON、图片、404 和 ETag 304；独立 workers.dev 也验证了页面、JSON、图片及 404。线上临时文件测试确认：首次新增和同名修改各只上传 1 个资产，修改后带旧 ETag 的请求得到新内容，删除后返回 404，全程未清缓存；测试文件已移除并恢复原博客快照。再次发布相同快照时，Wrangler 确认无需上传资产。一次单文件更新实测 Worker 上传阶段 3.89 秒、触发器部署 0.76 秒（文件上传包含在前者中），不包含 LiveSync 和合并等待，不代表固定时延承诺。迁移阶段生成过 112 个文件；本轮默认禁用 OG 后不再输出逐篇分享图，文件数量以实际构建结果为准。最新的同条件对照、热点和优化范围见 [性能分析报告](./performance-analysis.md)。

Docker Hub 在当前环境连接超时，正式 Dockerfile 的全新基础镜像构建尚未完成；已另用本机已有 Node 24 发布器镜像验证新代码的容器运行。真实 CouchDB 的同步兼容性、服务器长期运行与端到端更新时间，仍需在服务器上接入实际配置验证。
