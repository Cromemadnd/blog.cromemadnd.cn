# 博客设计体系全面整改计划

## 核心策略：插件本地化（fork）

`quartz/plugins/loader/gitLoader.ts:415-468` 支持 `./path` 本地插件源并 symlink 进 `.quartz/plugins/`。对需要改代码的 5 个外部插件，拷贝 `.quartz/plugins/<name>` → 仓库内 `plugins/<name>`（git 跟踪），yaml 中 `source: github:...` 改为 `./plugins/<name>`。**目录名必须保持原名**（注册表按 basename 匹配布局引用）。

## A. 评论系统：Giscus → 自建 CWD（用户点名）

1. 拷贝 comments 插件到 `plugins/comments/`
2. 重写 `Comments.tsx`：渲染 `<div id="comments" class="cwd-comments">`；选项精简为 `apiBaseUrl`（默认 `https://comments.cromemadnd.cn`）+ `scriptUrl`（默认 `https://unpkg.com/cwd-widget@0.1.13/dist/cwd.js`）
3. 重写 `scripts/comments.inline.ts`：动态注入 cwd.js（防重复加载）→ `new CWDComments({ el: '#comments', apiBaseUrl }).mount()`；监听 SPA `nav` 事件销毁旧实例并重新挂载
4. yaml：comments 选项精简、保留 afterBody 布局；**tag/folder 页型的 `positions.afterBody: []` 清空**（聚合页不再挂评论区）
5. custom.scss：清 giscus 残留样式，`.cwd-comments` 适配黑底主题

## B. 其余 4 个插件 fork 修复

- **plugins/og-image**（修中文豆腐块）：`loadAdditionalAsset` 处理 CJK segment——用 Google Fonts `css2?family=Noto+Sans+SC&text=<segment>` 取子集 TTF（沿用现有 fetchTtf 正则），按文本哈希缓存；`colorScheme` 改 `darkMode`；`readingTimeText` 按 locale 输出 "X 分钟阅读"；卡片图标改用 `quartz/static/favicon.jpg`（替换官方水晶 logo）；同步把 yaml `darkMode` 调色板改成站点真实配色（#0a0a0a/#e0e0e0/#9fdcff/#f4c76a）使分享卡与站点一致
- **plugins/content-meta**：阅读时间走 locale（"4Min" → "4 分钟阅读"）；新增 `showDate` 选项（yaml 设 false，替代 CSS display:none 的先渲染后隐藏 hack）
- **plugins/content-index**：RSS 过滤 tag 页与 404（它们凭构建时间戳霸占 feed）；频道描述按 locale 中文化
- **plugins/search**：SVG `<title>Search</title>` 改 i18n

## C. 硬伤修复（主仓库）

1. **主题切换**：yaml 禁用 darkmode 插件；custom.scss 删除三态选择器 hack 保留单套黑色变量；**关键**：darkmode 插件负责设置 `saved-theme` 属性，禁用后需在 `renderPage.tsx` 的 `<html>` 固定输出 `saved-theme="dark"`，否则代码高亮回退 github-light（深色 token 落黑底不可读）
2. **首页占位页**：创建 `content/projects/index.md`、`content/diary/index.md`（中文简介文案，格式与 notes/index.md 对齐）
3. **frontmatter 收口**（8 个 md 文件）：`summary` → `description`（Quartz 只认 description，现全部失效）；为每篇写真实中文摘要；tags 三种写法统一；`date: 2026-3-11` 补零；首页英文摘要中文化
4. **notes/index.md 双 H1**：删除正文 `# Notes`
5. **404 文案**：`quartz/i18n/locales/zh-CN.ts` "私有笔记或笔记不存在。" → "页面不存在或已被移动。"

## D. 设计体系统一（custom.scss / base.scss / DefaultFrame）

1. **断点统一**：硬编码 800px/600px 全部改用 variables.scss 断点；修复 801–1200px 区间右栏"背景板在、TOC 消失"错位
2. **颜色收口**：#d8f2ff/#070707/#151515/#111111 等硬编码收进变量；`::selection` 双定义去重
3. **TOC 对比度**：非激活项 #555×0.42（≈1.35:1）提到 ≥4.5:1
4. **移动端**：右栏内容不再裸 `display:none`——sidebar-toggle 移动端可见、侧栏改抽屉；品牌字号层级修正（移动端 2rem > 桌面 1.5rem 的反常）
5. **死代码清理**：PageTitle 的 `visibility:hidden` hack（改为 yaml 禁用插件）、`.sidebar.left footer`、`.breadcrumbs display:none`、`data-tags` 死属性、`"render"` 死事件监听
6. **命名修正**：DefaultFrame 布局容器 `popover-hint` 改名 `.page-header-main`（与 404.tsx 的语义混用解除）
7. **标签 # 前缀统一**：删除 custom.scss 两处 `content:none`，全站统一显示 `#tag`
8. **圆角统一**：text-highlight/YouTube 嵌入/checkbox 残留圆角对齐直角风格
9. **焦点样式**：全局 `:focus-visible` 描边；修正 search/侧栏开关同组按钮的 hover 一致性（`.darkmode button` 类错误选择器随按钮移除一并清理）

## E. i18n / CJK 排版

1. **字体栈**：`quartz/util/theme.ts` 回退栈加 "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC"
2. **CJK 排版**：正文加 `line-break: strict` 等基础优化
3. **文案 i18n**："Recent Notes" → i18n "最近的笔记"；侧栏开关 aria-label/title 服务端 i18n 渲染 + data 属性供脚本切换（"收起/展开左侧栏"）
4. **日期统一**：`formatNumericDate` 补零 ISO（2026-03-11）；删除 `.content-meta time display:none` 规则（由 B 的 showDate 替代）

## F. 验证

1. `npx quartz build` 无报错
2. `public/index.xml`：含 5 篇文章、无 tag 页
3. 查看新生成的 og-image.webp：中文正常、黑底配色、头像 logo
4. grep 产物：无 "Recent Notes"/"4Min"/"Hide left sidebar"/giscus 残留；`saved-theme="dark"` 正确输出
5. 浏览器截图首页/文章页/移动端宽度目检（若环境允许）

执行顺序：A → B → C → D → E → F，改完插件先构建验证一次再动样式层。不涉及 git 提交（除非你要求）。