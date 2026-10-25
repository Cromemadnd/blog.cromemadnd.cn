# Cloudflare 发布与 SSR

本项目现在提供两个入口：原有 Quartz 静态构建，以及 Node.js 发布器 + Cloudflare Workers SSR。文章修改通过独立的 LiveSync Bridge 从加密 CouchDB 还原到本地镜像，再由发布器处理。

```text
Obsidian → LiveSync → CouchDB → Bridge → 文件镜像
                                        ↓
                                  Node.js Publisher
                                        ↓
                                    R2 + D1
                                        ↑
                                  Workers SSR → 浏览器
```

## 先在本地运行

要求 Node.js >= 22.13、pnpm 10.11.1、Git。仓库已固定 packageManager。

```bash
pnpm install --frozen-lockfile
pnpm cloud:prepare
pnpm cloud:build
pnpm cloud:check
pnpm cloud:test
cp .env.example .env
```

`cloud:prepare` 只准备已启用的插件：远端插件按 `quartz.lock.json` 的 commit 获取，本地 fork 建立链接。它不会自动覆盖版本不一致的缓存，也不会修改笔记。已有本地插件源码改动时，先用 `node plugins/build.mjs` 更新它们的 dist，再构建。

`.env.example` 默认使用 `PUBLISH_TARGET=wrangler`，无需 Cloudflare 凭据：

```bash
PUBLISH_SKIP_OG_IMAGES=true pnpm publisher:publish
pnpm worker:dev
```

打开 Wrangler 输出的本地地址。发布器通过 `getPlatformProxy` 写入本地真实 workerd D1/R2；Worker 与它共用 `.publisher/wrangler`。发布器内部使用该目录下的 `v3` 存储布局，不能把两端指向不同目录。

持续开发可在另一个终端运行：

```bash
PUBLISH_SKIP_OG_IMAGES=true pnpm publisher:watch
```

仅构建产物：`pnpm publisher:build`。它不会向 Cloudflare 发布内容。`PUBLISH_TARGET=local` 则使用文件对象存储与普通 SQLite，适合调试发布逻辑；该模式的数据不是 Wrangler 的本地绑定数据。

`PUBLISH_SKIP_OG_IMAGES=true` 仅用于省去本地分享图生成；默认仍保留现有 OG 插件。首次生成分享图可能需要下载字体和表情资源。

## Cloudflare 初始化

以下命令需要你自己的 Cloudflare 登录或部署凭据；改造过程没有创建线上资源，也没有部署到原博客域名。

```bash
pnpm exec wrangler d1 create cromemadnd-blog
pnpm exec wrangler r2 bucket create cromemadnd-blog-content
```

将真实 database ID 和 bucket 名称填入 `apps/worker/wrangler.jsonc`，然后：

```bash
pnpm exec wrangler d1 migrations apply cromemadnd-blog --remote --config apps/worker/wrangler.jsonc
pnpm cloud:build
pnpm worker:dry-run
pnpm worker:deploy
```

首次尚未发布内容时，Worker 返回 503。先使用 workers.dev 域名验证，再配置正式域名路由。R2 桶保持私有；Worker 只导出发布清单里列出的页面与资源，不提供任意对象读取接口。

在自有服务器的 `.env` 中设置：

```dotenv
PUBLISH_TARGET=cloudflare
PUBLISH_SOURCE=/path/to/decrypted-blog-mirror
PUBLISH_STATE_DIR=/path/to/persistent-publisher-state
CLOUDFLARE_ACCOUNT_ID=你的账号ID
CLOUDFLARE_D1_DATABASE_ID=你的数据库ID
CLOUDFLARE_API_TOKEN=具有该账号D1写入权限的API令牌
R2_BUCKET=cromemadnd-blog-content
R2_ACCESS_KEY_ID=该桶的S3访问密钥ID
R2_SECRET_ACCESS_KEY=对应密钥
```

发布器的 D1 令牌和 R2 S3 密钥是两套凭据。Worker 通过绑定读取存储，不需要这些密钥。部署 Worker 可使用工作站自己的 Wrangler 登录。

```bash
pnpm publisher:publish
pnpm publisher:status
pnpm publisher:watch
```

普通文章更新不需要重新部署 Worker。变更组件、样式、配置或编译器后，重新构建并使用同一份 renderer ID 部署发布器和 Worker。Worker 会拒绝不匹配的版本，避免以错误布局读取内容；代码升级需要协调部署和重新发布，期间可能短暂返回 503。回滚内容时也必须使用兼容的 Worker。

## 接入加密 LiveSync

[LiveSync Bridge](https://github.com/vrtmrz/livesync-bridge) 是独立 Deno 服务。Compose 固定了一个上游 commit，使用其官方 Dockerfile。

```bash
cp deploy/livesync/config.example.json deploy/livesync/config.json
```

在配置文件中填写 CouchDB 连接、E2EE 口令、路径混淆设置，并将 `baseDir` 设置为专门用于发布的笔记目录。例如 `blog/`。如果库使用独立 ID key，按 Bridge 文档增加 `idDerivationKey`；算法、路径混淆和密钥必须与现有库匹配。不要将这些值写入提交或复制到 Cloudflare。

Bridge 的文件镜像支持双向同步；Publisher 仅以只读方式挂载镜像，并将所有状态与产物写入另一块卷。

```bash
docker compose -f deploy/compose.yaml build
docker compose -f deploy/compose.yaml up -d bridge
docker compose -f deploy/compose.yaml logs -f bridge
```

确认首次同步已结束、镜像内的文件数量及内容正确，再标记准备完成并启动发布器：

```bash
docker compose -f deploy/compose.yaml exec bridge touch /app/data/.publisher-ready
docker compose -f deploy/compose.yaml up -d publisher
docker compose -f deploy/compose.yaml logs -f publisher
```

准备标记位于镜像目录外，不会同步回笔记库。正常重启会保留标记和镜像。进行远端重建或重新初始化镜像前，应停止 Publisher，并先移除准备标记，待同步完成后再恢复。

Compose 的 Publisher 镜像在构建时安装锁定依赖、准备插件和打包。镜像不包含 `content/`、CouchDB 凭据或本地缓存。构建 Worker 的工作站与构建 Publisher 镜像的服务器必须使用相同代码、配置和锁文件。可用以下命令比对 ID：

```bash
cat .cloud/build-info.json
docker compose -f deploy/compose.yaml run --rm --no-deps publisher cat .cloud/build-info.json
```

## 增量行为与发布一致性

- SQLite 持久保存解析缓存、正文缓存、依赖关系及待处理文件代次。Markdown 阶段和 HTML 转换阶段分别缓存；完整汇总别名后再执行链接转换。
- 文件内容、路径、源时间、插件命名空间和编译版本参与指纹。新增、删除、重命名会保守地使链接解析缓存失效。
- 常规编辑仅重新解析变化的 Markdown；嵌入依赖的变化会使引用文章正文失效。循环嵌入沿用 Quartz 的截断行为。
- 文件夹、标签、Canvas、Bases 等虚拟正文，以及搜索、RSS、站点地图可保守地整体生成；只有内容哈希变化的对象才需上传。
- 发布编译遇到转换或 emitter 异常会失败，保留线上旧版本。发布目录没有 Markdown 或没有可发布文章时，默认拒绝发布。
- 新产物先写 R2，再暂存 D1 的完整索引快照，最后以比较并交换方式切换 `active_release`。上传或暂存失败时，未完成版本不可见。
- Worker 每次请求先固定发布版本，再查询页面；正文、脚本、CSS、图片和搜索索引使用该版本的资源清单。页面缓存键包含发布版本和 renderer ID。
- HTML 向浏览器返回 `private, no-cache`；版本化资源返回一年 immutable。不要额外配置绕过这些规则的全站 HTML 强制缓存。
- 监听器默认等待 2 秒合并修改，每 30 秒重新校准快照；失败后自动重试。构建期间的新修改保留到下一批。
- 发布器使用独立 SQLite 的 OS 锁。正常退出、崩溃或重启都会释放锁，不需要清理 PID 文件。状态卷应使用支持 SQLite 文件锁的本地文件系统。

发布器默认继承 Quartz 的草稿过滤、`unlisted` 和 `ignorePatterns`。`unlisted` 仍然允许 URL 直达。可设置 `PUBLISH_REQUIRE_FLAG=true`，只发布 frontmatter 带 `publish: true` 的 Markdown；此开关不将附件目录变成访问控制边界，发布镜像内的普通附件和虚拟页面仍可能被发布。因此镜像应只包含准备公开的内容。

日期优先使用 frontmatter 的 `created`、`modified`、`published`，缺省时使用镜像源文件时间。发布器不通过镜像目录读取 Git 历史，建议为需要稳定日期的文章显式填写 frontmatter。

## 回滚与运维

```bash
pnpm publisher:status
pnpm publisher:rollback -- 发布版本ID
```

也可以直接调用 `node --env-file-if-exists=.env .cloud/publisher.mjs rollback 发布版本ID`。回滚仅允许已完成的版本。持续监听时，下一次构建可能再次发布最新笔记；需要保留回滚状态时先停止 watcher。

发布器输出 `built`、`published`、`publish-failed` JSON 日志。`built` 中的 `parsed`、`transformed`、`bodies`、`reusedBodies` 表示实际解析和正文复用情况，`published` 记录新增上传与复用对象数量。

当前不会自动删除 R2 历史对象或 D1 历史版本，以保留回滚能力。服务器侧的对象缓存、SQLite 缓存、快照和输出也应监控磁盘用量；执行本地清理前停止 Publisher，勿删除正在使用的输入镜像。没有实现网页编辑后台，也没有将网站数据反向写回 CouchDB。

原有 `pnpm quartz build` 静态构建入口仍保留。

## 已验证范围

已通过发布器与 Worker 集成测试（包含嵌入、别名缓存、草稿、隐藏文章、删除、冲突、回滚、资源版本、进程强制终止及恢复），并在真实本地 workerd 中检查现有博客的 28 个页面。原有 Quartz 静态构建和相关回归测试也已通过。Publisher 与 Bridge 容器已完成构建。真实 CouchDB 的解密兼容性与 Cloudflare 远端写入仍需使用你的配置进行联调；没有进行线上部署。
