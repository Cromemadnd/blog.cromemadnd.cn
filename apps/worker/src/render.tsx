import { h } from "preact"
import { Fragment, jsx, jsxs } from "preact/jsx-runtime"
import { toJsxRuntime, type Jsx } from "hast-util-to-jsx-runtime"
import { fromHtml } from "hast-util-from-html"
import type { Root, Element } from "hast"
import { visit } from "unist-util-visit"
import { renderDocument } from "../../../quartz/components/renderPage"
import type { QuartzComponent, QuartzComponentProps } from "../../../quartz/components/types"
import type { FullSlug, FilePath } from "../../../quartz/util/path"
import type { QuartzPluginData } from "../../../quartz/plugins/vfile"
import { trieFromAllFiles, type BuildCtx } from "../../../quartz/util/ctx"
import { revivePageData, type PageArtifact, type SiteArtifact } from "../../../shared/artifact"
import { layout } from "../../../.cloud/runtime-layout.mjs"

function treeToJsx(tree: Root) {
  const text = (children: unknown): string =>
    Array.isArray(children) ? children.map(text).join("") : String(children ?? "")
  return toJsxRuntime(tree, {
    Fragment,
    jsx: jsx as Jsx,
    jsxs: jsxs as Jsx,
    elementAttributeNameCase: "html",
    components: {
      script: ({ children, ...props }) =>
        h("script", { ...props, dangerouslySetInnerHTML: { __html: text(children) } }),
      style: ({ children, ...props }) =>
        h("style", { ...props, dangerouslySetInnerHTML: { __html: text(children) } }),
    },
  })
}

/** Pin only known assets. Article navigation keeps its public, stable URL. */
export function assetUrl(value: string, slug: string, site: SiteArtifact): string {
  if (!value || value.startsWith("#") || /^(data|blob|mailto|tel):/i.test(value)) return value
  const origin = `https://${site.configuration.baseUrl ?? "blog.invalid"}`
  const url = new URL(value, `${origin.replace(/\/$/, "")}/${slug}`)
  if (url.origin !== new URL(origin).origin) return value
  let filename: string
  try {
    filename = decodeURIComponent(url.pathname).replace(/^\//, "")
  } catch {
    return value
  }
  if (!Object.hasOwn(site.assets, filename)) return value
  return `/__releases/${site.releaseId}/${filename.split("/").map(encodeURIComponent).join("/")}${url.search}${url.hash}`
}

function pinTree(tree: Root, slug: string, site: SiteArtifact): Root {
  const copy = structuredClone(tree)
  visit(copy, "element", (node: Element) => {
    for (const key of ["src", "href", "poster"]) {
      const value = node.properties[key]
      if (typeof value === "string") node.properties[key] = assetUrl(value, slug, site)
    }
    if (node.tagName === "meta" && typeof node.properties.content === "string") {
      node.properties.content = assetUrl(node.properties.content, slug, site)
    }
    const srcSet = node.properties.srcSet
    if (typeof srcSet === "string" && !srcSet.startsWith("data:")) {
      node.properties.srcSet = srcSet
        .split(",")
        .map((entry) => {
          const [url, ...descriptor] = entry.trim().split(/\s+/)
          return [assetUrl(url, slug, site), ...descriptor].join(" ")
        })
        .join(", ")
    }
  })
  return copy
}

export function renderArtifact(page: PageArtifact, site: SiteArtifact): string {
  const slug = page.slug as FullSlug
  const data = (value: Record<string, unknown>): QuartzPluginData => ({
    ...revivePageData(value),
    filePath: String(value.relativePath ?? `${value.slug}.md`) as FilePath,
  })
  const allFiles = Object.values(site.pages).map((entry) => data(entry.data))
  const resources = {
    css: page.resources.css.map((resource) =>
      resource.inline ? resource : { ...resource, content: assetUrl(resource.content, slug, site) },
    ),
    js: page.resources.js.map((resource) => {
      if (resource.contentType === "external")
        return { ...resource, src: assetUrl(resource.src, slug, site) }
      if (resource.script.startsWith("const fetchData = fetch(")) {
        return {
          ...resource,
          script: resource.script.replace(
            /fetch\("([^"]+)"\)/,
            (_match, url: string) => `fetch(${JSON.stringify(assetUrl(url, slug, site))})`,
          ),
        }
      }
      return resource
    }),
    additionalHead: page.resources.additionalHead.map((html) =>
      treeToJsx(pinTree(fromHtml(html, { fragment: true }), slug, site)),
    ),
  }
  const ctx: BuildCtx = {
    buildId: site.releaseId,
    incremental: false,
    virtualPages: [],
    allFiles: [],
    allSlugs: Object.keys(site.pages) as FullSlug[],
    trie: trieFromAllFiles(allFiles),
    cfg: {
      configuration: site.configuration,
      plugins: {
        transformers: [],
        filters: [],
        emitters: site.emitterNames.map((name) => ({ name, emit: async () => [] })),
      },
    },
    argv: {
      directory: "",
      output: "",
      serve: false,
      watch: false,
      verbose: false,
      port: 0,
      wsPort: 0,
    },
  }
  const CompiledBody: QuartzComponent = () => treeToJsx(pinTree(page.body, slug, site))
  const resolved = { ...layout.defaults, ...layout.byPageType[page.layout] }
  const props: QuartzComponentProps = {
    ctx,
    cfg: site.configuration,
    tree: page.body,
    fileData: data(page.data),
    allFiles,
    children: [],
    externalResources: resources,
  }
  return renderDocument(
    site.configuration,
    slug,
    props,
    {
      head: resolved.head!,
      header: resolved.header ?? [],
      beforeBody: resolved.beforeBody ?? [],
      pageBody: CompiledBody,
      afterBody: resolved.afterBody ?? [],
      left: resolved.left ?? [],
      right: resolved.right ?? [],
      footer: resolved.footer ?? (() => null),
      frame: page.frame,
    },
    resources,
  )
}
