import fs from "node:fs/promises"
import path from "node:path"
import { globby } from "globby"
import { VFile } from "vfile"
import { render } from "preact-render-to-string"
import { fromHtml } from "hast-util-from-html"
import { visit } from "unist-util-visit"
import type { Root, Element } from "hast"
import cfg, { layout } from "../../quartz"
import { createMdProcessor, createHtmlProcessor } from "../../quartz/processors/parse"
import { filterContent } from "../../quartz/processors/filter"
import { getStaticResourcesFromPlugins } from "../../quartz/plugins"
import { defaultProcessedContent, type ProcessedContent } from "../../quartz/plugins/vfile"
import type {
  QuartzPageTypePluginInstance,
  QuartzEmitterPluginInstance,
  QuartzTransformerPluginInstance,
} from "../../quartz/plugins/types"
import {
  resolveLayout,
  populateVirtualPageHtmlAst,
} from "../../quartz/plugins/pageTypes/dispatcher"
import { pageResources, preparePageTree } from "../../quartz/components/renderPage"
import type { QuartzComponentProps } from "../../quartz/components/types"
import { trieFromAllFiles, type BuildCtx } from "../../quartz/util/ctx"
import { slugifyFilePath, type FilePath, type FullSlug, pathToRoot } from "../../quartz/util/path"
import type { StaticResources } from "../../quartz/util/resources"
import { detectSlugCollisions } from "../../quartz/util/slugCollisions"
import {
  ARTIFACT_VERSION,
  revivePageData,
  type PageArtifact,
  type PageEntry,
  type Release,
} from "../../shared/artifact"
import { BuildState } from "./state"
import { ObjectStore, contentType } from "./objects"
import { hash, stableJson } from "./hash"
import { snapshot, type Snapshot } from "./snapshot"
import { changedPaths, affectedPages, type Dependency, type SourceInfo } from "./plan"

export interface CompilerOptions {
  source: string
  stateDirectory: string
  rendererId: string
  allowEmpty?: boolean
  requirePublishFlag?: boolean
  skipOgImages?: boolean
}

interface CachedParse {
  tree: Root
  data: Record<string, unknown>
}
interface CachedEmitter {
  files: { path: string; ref: Awaited<ReturnType<ObjectStore["put"]>> }[]
  hashedResourceNames?: BuildCtx["hashedResourceNames"]
  componentCssMap?: [string, string][]
  extractedInlineResources?: [string, string][]
}

export interface BuildResult {
  release: Release
  snapshot: Snapshot
  dependencies: Dependency[]
  stats: { parsed: number; bodies: number; reusedBodies: number; changed: string[] }
}

/** Only the metadata used by page components crosses the publishing boundary. */
function wireData(data: Record<string, unknown>): Record<string, unknown> {
  const { htmlAst: _ast, blocks: _blocks, filePath: _file, ...rest } = data
  return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>
}

function compilationData(data: Record<string, unknown>): Record<string, unknown> {
  const { filePath: _file, ...rest } = data
  return rest
}

function dependenciesOf(content: ProcessedContent[]): Dependency[] {
  const edges: Dependency[] = []
  const slugs = new Set(content.map(([, file]) => file.data.slug as string))
  for (const [tree, file] of content) {
    const source = file.data.slug as string
    for (const target of (file.data.links as string[] | undefined) ?? []) {
      edges.push({ source, target, type: "link" })
    }
    visit(tree, "element", (node: Element) => {
      if (
        node.tagName !== "blockquote" ||
        !(node.properties.className as string[] | undefined)?.includes("transclude")
      )
        return
      const first = node.children[0]
      if (first?.type !== "element") return
      let target = String(first.properties["data-slug"] ?? source)
      if (!slugs.has(target)) {
        const stripped = target.replace(/\.[^/.]+$/, "")
        if (slugs.has(stripped)) target = stripped
      }
      edges.push({ source, target, type: "embed" })
    })
  }
  return edges
}

function dependencySignature(
  slug: string,
  edges: Dependency[],
  fingerprints: Map<string, string>,
): string {
  const visited = new Set<string>()
  const queue = [slug]
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]
    if (visited.has(current)) continue
    visited.add(current)
    for (const edge of edges)
      if (edge.source === current && edge.type === "embed") queue.push(edge.target)
  }
  return hash(
    stableJson([...visited].sort().map((key) => [key, fingerprints.get(key) ?? "missing"])),
  )
}

export class QuartzCompiler {
  readonly state: BuildState
  readonly objects: ObjectStore
  readonly options: CompilerOptions

  constructor(options: CompilerOptions) {
    this.options = {
      ...options,
      source: path.resolve(options.source),
      stateDirectory: path.resolve(options.stateDirectory),
    }
    this.state = new BuildState(path.join(this.options.stateDirectory, "state.sqlite"))
    this.objects = new ObjectStore(this.options.stateDirectory)
    if (
      this.options.source === this.options.stateDirectory ||
      this.options.stateDirectory.startsWith(`${this.options.source}${path.sep}`)
    ) {
      throw new Error("Publisher state must be outside the mirrored source directory")
    }
  }

  async build(): Promise<BuildResult> {
    const { options, state, objects } = this
    const input = await snapshot(
      options.source,
      path.join(options.stateDirectory, "snapshots"),
      cfg.configuration.ignorePatterns,
    )
    if (!options.allowEmpty && !Object.keys(input.files).some((name) => name.endsWith(".md"))) {
      throw new Error(
        "Refusing an empty vault; wait for Bridge's initial sync or explicitly allow empty publishing",
      )
    }
    const mode = {
      renderer: options.rendererId,
      requirePublishFlag: !!options.requirePublishFlag,
      skipOgImages: !!options.skipOgImages,
    }
    const releaseId = hash(stableJson({ input: input.id, mode })).slice(0, 32)
    const output = path.join(options.stateDirectory, "outputs", releaseId)
    await fs.mkdir(output, { recursive: true })
    const allFiles = Object.keys(input.files) as FilePath[]
    const namespace = hash(stableJson(allFiles))
    const previous = state.get<Record<string, SourceInfo>>("publishedFiles") ?? {}
    const changed = changedPaths(previous, input.files)
    const buildCfg = {
      ...cfg,
      plugins: {
        ...cfg.plugins,
        // Mirror filesystem birth times and absent Git history are not authoritative dates.
        transformers: cfg.plugins.transformers.map((plugin): QuartzTransformerPluginInstance =>
          plugin.name !== "CreatedModifiedDate"
            ? plugin
            : {
                name: plugin.name,
                markdownPlugins: () => [
                  () => (_tree: unknown, file: VFile) => {
                    const source = input.files[file.data.relativePath as string]
                    const fm = (file.data.frontmatter ?? {}) as Record<string, unknown>
                    const date = (value: unknown, fallback: number) => {
                      const result = new Date((value ?? fallback) as string | number)
                      if (!Number.isFinite(result.getTime()))
                        throw new Error(`Invalid date in ${file.path}`)
                      return result
                    }
                    file.data.dates = {
                      created: date(fm.created, source.birthtimeMs),
                      modified: date(fm.modified, source.mtimeMs),
                      published: date(fm.published ?? fm.created, source.birthtimeMs),
                    }
                    file.data.defaultDateType = "modified"
                  },
                ],
              },
        ),
        emitters: cfg.plugins.emitters.filter(
          (emitter) => !options.skipOgImages || emitter.name !== "CustomOgImages",
        ),
      },
    }
    const ctx: BuildCtx = {
      cfg: buildCfg,
      buildId: releaseId,
      allFiles,
      allSlugs: allFiles.map((filename) => slugifyFilePath(filename)),
      incremental: true,
      virtualPages: [],
      argv: {
        directory: input.directory,
        output,
        serve: false,
        watch: false,
        verbose: false,
        port: 0,
        wsPort: 0,
        concurrency: 1,
      },
    }
    const md = createMdProcessor(ctx)
    const html = createHtmlProcessor(ctx)
    let parsed = 0
    const content: ProcessedContent[] = []
    for (const relativePath of allFiles.filter((name) => name.endsWith(".md"))) {
      const cacheKey = `parse:${hash(stableJson({ mode, namespace, relativePath, source: input.files[relativePath] }))}`
      const cached = state.cached<CachedParse>(cacheKey)
      const file = new VFile({ path: path.join(input.directory, relativePath) })
      if (cached) {
        file.data = revivePageData(cached.data)
        file.data.filePath = file.path as FilePath
        content.push([cached.tree, file])
        continue
      }
      file.value = (await fs.readFile(file.path, "utf8")).trim()
      file.data.filePath = file.path as FilePath
      file.data.relativePath = relativePath
      file.data.slug = slugifyFilePath(relativePath)
      for (const plugin of buildCfg.plugins.transformers) {
        if (plugin.textTransform) file.value = plugin.textTransform(ctx, file.value.toString())
      }
      // Unlike the development parser, publishing fails closed on any transform error.
      const mdTree = await md.run(md.parse(file), file)
      const tree = await html.run(mdTree, file)
      state.cache(cacheKey, { tree, data: file.data })
      content.push([tree, file])
      parsed++
    }
    if (detectSlugCollisions(content).length)
      throw new Error("Duplicate article slugs; resolve collisions before publishing")
    let published = filterContent(ctx, content)
    if (options.requirePublishFlag)
      published = published.filter(([, file]) => file.data.frontmatter?.publish === true)
    if (!options.allowEmpty && published.length === 0)
      throw new Error("Refusing to publish zero articles")
    const resources = getStaticResourcesFromPlugins(ctx)
    const componentResources = buildCfg.plugins.emitters.find(
      (emitter) => emitter.name === "ComponentResources",
    )
    if (componentResources)
      await this.emitCached(
        componentResources,
        ctx,
        published,
        resources,
        `resources:${options.rendererId}`,
      )
    const pageTypes = [
      ...((buildCfg.plugins.pageTypes ?? []) as unknown as QuartzPageTypePluginInstance[]),
    ].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    const virtual: {
      tree: Root
      vfile: VFile
      layout: ReturnType<typeof resolveLayout>
      vpSlug: FullSlug
      pageType: QuartzPageTypePluginInstance
    }[] = []
    for (const pt of pageTypes) {
      for (const page of pt.generate?.({ content: published, cfg: buildCfg.configuration, ctx }) ??
        []) {
        const [tree, vfile] = defaultProcessedContent({
          slug: page.slug as FullSlug,
          relativePath: `${page.slug}.md` as FilePath,
          frontmatter: { title: page.title, tags: [] },
          defaultDateType: "modified",
          dates: {
            created: new Date(
              Math.max(...Object.values(input.files).map((file) => file.mtimeMs), 0),
            ),
            modified: new Date(
              Math.max(...Object.values(input.files).map((file) => file.mtimeMs), 0),
            ),
            published: new Date(
              Math.max(...Object.values(input.files).map((file) => file.mtimeMs), 0),
            ),
          },
          ...page.data,
        })
        virtual.push({
          tree,
          vfile,
          vpSlug: page.slug as FullSlug,
          pageType: pt,
          layout: resolveLayout(pt, layout.defaults, layout.byPageType),
        })
        if (page.slug !== "404") ctx.virtualPages.push([tree, vfile])
      }
    }
    const withVirtual = [...published, ...ctx.virtualPages]
    const allData = [
      ...published.map(([, file]) => file.data),
      ...virtual.map((page) => page.vfile.data),
    ]
    ctx.trie = trieFromAllFiles(published.map(([, file]) => file.data))
    populateVirtualPageHtmlAst(virtual, ctx, allData, resources)
    const metadataHash = hash(stableJson(allData.map((data) => wireData(data))))
    for (const emitter of buildCfg.plugins.emitters) {
      if (emitter.name === "PageTypeDispatcher" || emitter.name === "ComponentResources") continue
      if (emitter.name === "CustomOgImages") {
        for (const item of withVirtual) {
          await this.emitCached(
            emitter,
            ctx,
            [item],
            resources,
            `emitter:${emitter.name}:${options.rendererId}:${hash(stableJson(wireData(item[1].data)))}`,
          )
        }
      } else {
        await this.emitCached(
          emitter,
          ctx,
          withVirtual,
          resources,
          `emitter:${emitter.name}:${options.rendererId}:${input.id}:${metadataHash}`,
        )
      }
    }
    const dependencies = dependenciesOf([
      ...published,
      ...virtual.map((page): ProcessedContent => [page.tree, page.vfile]),
    ])
    const changedSlugs = changed.map((filename) => slugifyFilePath(filename as FilePath))
    const affected = affectedPages(
      changedSlugs,
      state.get<Dependency[]>("publishedDependencies") ?? [],
      dependencies,
    )
    const virtualSlugs = new Set(virtual.map((page) => page.vpSlug as string))
    const fingerprints = new Map(
      allData.map((data) => [
        data.slug as string,
        hash(
          stableJson({
            data: compilationData(data),
            global:
              virtualSlugs.has(data.slug as string) || data.basesBlocks ? metadataHash : undefined,
          }),
        ),
      ]),
    )
    const transforms = pageTypes.flatMap((pt) => pt.treeTransforms?.(ctx) ?? [])
    const pages: Record<string, PageEntry> = {}
    let bodies = 0
    let reusedBodies = 0
    const candidates = [
      ...published.map(([tree, file]) => ({
        tree,
        file,
        pt: pageTypes.find((pt) =>
          pt.match({ slug: file.data.slug!, fileData: file.data, cfg: buildCfg.configuration }),
        ),
      })),
      ...virtual.map((page) => ({ tree: page.tree, file: page.vfile, pt: page.pageType })),
    ]
    for (const { tree, file, pt } of candidates) {
      if (!pt) throw new Error(`No page type for ${file.data.slug}`)
      const slug = file.data.slug!
      if (pages[slug]) throw new Error(`Duplicate generated page: ${slug}`)
      const resolvedLayout = resolveLayout(pt, layout.defaults, layout.byPageType)
      const externalResources = pageResources(
        slug === "404" ? ("/" as FullSlug) : pathToRoot(slug),
        resources,
        ctx,
      )
      const props: QuartzComponentProps = {
        ctx,
        tree,
        fileData: file.data,
        cfg: buildCfg.configuration,
        allFiles: allData,
        children: [],
        externalResources,
      }
      // Virtual pages, Bases and unknown tree transforms can depend on the whole vault.
      const globalDependency =
        pt.layout !== "content" || file.data.basesBlocks || transforms.length > 1
      const bodyKey = `body:${hash(
        stableJson({
          renderer: options.rendererId,
          tree,
          data: compilationData(file.data),
          dependencies: dependencySignature(slug, dependencies, fingerprints),
          global: globalDependency ? metadataHash : undefined,
        }),
      )}`
      let body = state.cached<Root>(bodyKey)
      if (!body) {
        props.tree = preparePageTree(buildCfg.configuration, slug, props, transforms)
        body = fromHtml(render(resolvedLayout.pageBody(props)), { fragment: true })
        state.cache(bodyKey, body)
        bodies++
      } else reusedBodies++
      const data = wireData(file.data)
      const artifact: PageArtifact = {
        version: ARTIFACT_VERSION,
        slug,
        layout: pt.layout,
        frame: resolvedLayout.frame ?? "default",
        body,
        data,
        resources: {
          css: externalResources.css,
          js: externalResources.js,
          additionalHead: externalResources.additionalHead.map((head) =>
            render(typeof head === "function" ? head(file.data) : head),
          ),
        },
      }
      pages[slug] = {
        slug,
        title: file.data.frontmatter?.title ?? slug,
        layout: pt.layout,
        unlisted: file.data.unlisted === true,
        data,
        object: await objects.json(artifact),
      }
    }
    const assets: Release["site"]["assets"] = {}
    const redirects: Record<string, string> = {}
    for (const filename of await globby("**/*", { cwd: output })) {
      const bytes = await fs.readFile(path.join(output, filename))
      if (filename.endsWith(".html")) {
        const target = bytes.toString().match(/<link rel="canonical" href="([^"]+)"/)
        if (!target) throw new Error(`Unexpected HTML emitter output: ${filename}`)
        const url = new URL(target[1], `https://blog.invalid/${filename}`)
        if (url.origin !== "https://blog.invalid")
          throw new Error(`External alias redirect: ${filename}`)
        redirects[filename.slice(0, -5)] = url.pathname + url.search + url.hash
      } else assets[filename] = await objects.put(bytes, contentType(filename))
    }
    const site: Release["site"] = {
      version: ARTIFACT_VERSION,
      releaseId,
      rendererId: options.rendererId,
      configuration: buildCfg.configuration,
      pages,
      assets,
      redirects,
      emitterNames: buildCfg.plugins.emitters.map((emitter) => emitter.name),
    }
    const release: Release = {
      id: releaseId,
      rendererId: options.rendererId,
      site,
      manifest: await objects.json(site),
    }
    state.set("lastBuild", { release, snapshot: input, dependencies })
    return {
      release,
      snapshot: input,
      dependencies,
      stats: { parsed, bodies, reusedBodies, changed: [...affected] },
    }
  }

  markPublished(result: BuildResult): void {
    this.state.set("publishedFiles", result.snapshot.files)
    this.state.set("publishedDependencies", result.dependencies)
    this.state.set("publishedRelease", result.release.id)
  }

  private async emitCached(
    emitter: QuartzEmitterPluginInstance,
    ctx: BuildCtx,
    content: ProcessedContent[],
    resources: StaticResources,
    key: string,
  ): Promise<void> {
    const cached = this.state.cached<CachedEmitter>(key)
    if (cached) {
      for (const file of cached.files) {
        const filename = path.join(ctx.argv.output, file.path)
        await fs.mkdir(path.dirname(filename), { recursive: true })
        await fs.writeFile(filename, await this.objects.read(file.ref))
      }
      if (cached.hashedResourceNames) ctx.hashedResourceNames = cached.hashedResourceNames
      if (cached.componentCssMap) ctx.componentCssMap = new Map(cached.componentCssMap)
      if (cached.extractedInlineResources)
        ctx.extractedInlineResources = new Map(cached.extractedInlineResources)
      return
    }
    const result = await emitter.emit(ctx, content, resources)
    const filenames: string[] = []
    if (Symbol.asyncIterator in result)
      for await (const filename of result) filenames.push(filename)
    else filenames.push(...result)
    const files: CachedEmitter["files"] = []
    for (const filename of filenames)
      files.push({
        path: path.relative(ctx.argv.output, filename).split(path.sep).join("/"),
        ref: await this.objects.put(await fs.readFile(filename), contentType(filename)),
      })
    this.state.cache(key, {
      files,
      ...(emitter.name === "ComponentResources"
        ? {
            hashedResourceNames: ctx.hashedResourceNames,
            componentCssMap: [...(ctx.componentCssMap ?? [])],
            extractedInlineResources: [...(ctx.extractedInlineResources ?? [])],
          }
        : {}),
    })
  }
}
