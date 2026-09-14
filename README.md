# Cromemadnd's Blog

基于 [Quartz](./README.quartz.md) v5.0.0 搭建的小窝，魔改了很多组件。

使用了 [Giscus](https://github.com/giscus/giscus) 提供评论服务。

## 隐藏文章

文章 frontmatter 里加 `unlisted: true` 即可把它从所有「发现入口」里藏起来，页面本身照常生成，可直接用 URL 访问：

```yaml
---
title: 一篇不公开的笔记
unlisted: true
---
```

被隐藏的文章不会出现在：

- 左侧目录树（Explorer）
- 搜索结果
- 关系图（Graph）
- 文件夹列表、标签列表
- `sitemap.xml` 与 RSS
- 其他页面的反向链接（Backlinks）

实现方式：`quartz.config.yaml` 中启用的 `github:quartz-community/unlisted-pages` 会把 `frontmatter.unlisted` 复制到 `file.data.unlisted`，而 `content-index`、`search`、`graph`、`folder-page`、`tag-page` 等插件都遵循该标记 —— 上述列表以外的组件（目录树、搜索、关系图）都是读取 `content-index` 产出的 `static/contentIndex.json`，因此自动跟随。

注意：`ignorePatterns` 里的 `private` 是**另一回事** —— 它会让文件被完全跳过、连 HTML 都不生成，无法通过 URL 访问。
