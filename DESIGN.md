1. 核心视觉风格 (Core Visual Identity)

设计语言： 极客暗黑、工业硬朗、动态不规则。

配色方案 (Color Palette)：

--bg-main: #000000 (基础背景，纯黑)

--bg-dark: #0a0a0a (容器/侧边栏背景)

--text-main: #e0e0e0 (正文，高对比度白，但略带一点灰，避免刺眼)

--text-muted: #555555 (侧边栏/未激活状态文字，低对比度暗灰)

核心视觉元素：

全局棋盘格/网格微纹理（作为背景层叠）。

60° 斜切分栏： 桌面端（Desktop）左侧导航栏与主体内容区之间使用 60° 斜切面过度（对应 CSS 角度为 120deg 或 linear-gradient(120deg, ...)）。

2. Quartz 架构映射与修改范围 (Quartz Mapping)

Agent 在实现时，请严格按照以下映射关系修改代码，不要触动 Quartz 的核心数据流：

全局样式与变量：

修改 quartz/styles/custom.scss。

在此文件中定义上述配色变量，并实现全局网格背景与 60° 斜切布局。

布局配置：

修改 quartz.config.ts 中的 plugins.layout。

确保三栏结构正确：左边栏（Explorer/导航）、中间栏（Main Content）、右边栏（TOC/目录）。

组件级样式微调：

左侧导航 (Explorer)： 修改 quartz/components/styles/explorer.scss，将文字颜色设为 --text-muted，Hover 时变为 --text-main。

右侧目录 (TOC)： 修改 quartz/components/styles/Toc.scss，降低未激活标题的对比度，确保能清晰看出当前阅读位置。

3. 严格限制与边界条件 (Constraints & Edge Cases)

Agent 在编写 CSS/TSX 时必须遵守以下硬性规定：

文字安全距离 (Padding Safety)： 斜切背景绝对不能覆盖或遮挡 Layout.left 或 Layout.main 中的文字。必须通过调整 padding-left/padding-right 或加宽容器，确保文字对齐线在视觉上保持绝对垂直。

移动端响应式崩溃 (Responsive Breakpoints)：

当屏幕宽度 $\le 768px$ (Mobile/Tablet) 时，必须完全禁用 60° 斜切视觉和三栏布局。

移动端应自动回退为标准的垂直单栏布局，背景变为纯黑，隐藏右侧 TOC，确保手机端阅读体验正常。

图片加载失败容错 (Image Fallback)：

针对 Markdown 中加载失败的图片（如裂开的图标），在全局样式中为其添加一个带有些许极客科技感的暗灰色边框与占位提示，禁止直接暴露原生破裂图标。

4. 你的下一步工作流程 (Workflow for Agent)

优先修改 quartz/styles/custom.scss 实现基础的暗黑配色与斜切背景。

逐步微调 quartz/components/ 下的相关组件，每完成一个组件的样式修改，向我汇报进度并展示代码。
