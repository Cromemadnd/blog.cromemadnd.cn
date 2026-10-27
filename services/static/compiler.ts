import fs from "node:fs/promises"
import path from "node:path"
import { DatabaseSync, type StatementSync } from "node:sqlite"
import { createHash } from "node:crypto"
import { VFile } from "vfile"
import type { Root as MarkdownRoot } from "remark-parse/lib"
import type { Root } from "hast"
import { loadQuartzConfig } from "../../quartz/plugins/loader/config-loader"
import { createMdProcessor, createHtmlProcessor } from "../../quartz/processors/parse"
import { filterContent } from "../../quartz/processors/filter"
import { getStaticResourcesFromPlugins } from "../../quartz/plugins"
import { detectSlugCollisions } from "../../quartz/util/slugCollisions"
import { slugifyFilePath, type FilePath, type FullSlug } from "../../quartz/util/path"
import type { BuildCtx } from "../../quartz/util/ctx"
import type { ProcessedContent } from "../../quartz/plugins/vfile"
import type {
  QuartzEmitterPluginInstance,
  QuartzPageTypePluginInstance,
} from "../../quartz/plugins/types"
import type { StaticResources } from "../../quartz/util/resources"

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
type SourceFile = { hash: string; mtimeMs: number; birthtimeMs: number }
type Input = { directory: string; files: Record<string, SourceFile> }
type Cached = { tree: MarkdownRoot | Root; data: Record<string, unknown>; value?: string }

// Parsed ASTs are JSON snapshots, never the mutable trees handed to rendering plugins.
function restore(file: VFile, data: Record<string, unknown>) {
  file.data = { ...data, filePath: file.path as FilePath }
  if (data.dates) {
    file.data.dates = Object.fromEntries(
      Object.entries(data.dates).map(([key, value]) => [key, new Date(value as string)]),
    ) as NonNullable<typeof file.data.dates>
  }
}
function cacheData(file: VFile) {
  const { filePath: _path, ...data } = file.data
  return data
}

export class StaticCompiler {
  private db: DatabaseSync
  private readCache: StatementSync
  private writeCache: StatementSync
  private configuration: ReturnType<typeof loadQuartzConfig>
  // These outputs depend on code/config, which is fixed for this process lifetime.
  private resources?: { directory: string; data: Partial<BuildCtx> }

  constructor(
    readonly state: string,
    skipOgImages = false,
  ) {
    this.configuration = loadQuartzConfig(undefined, {
      strict: true,
      excludePlugins: skipOgImages ? ["og-image"] : [],
    })
    void this.configuration.catch(() => {})
    this.db = new DatabaseSync(path.join(state, "parse.sqlite"))
    this.db.exec("CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    this.readCache = this.db.prepare("SELECT value FROM cache WHERE key = ?")
    this.writeCache = this.db.prepare("INSERT OR REPLACE INTO cache (key, value) VALUES (?, ?)")
  }

  async ready() {
    await this.configuration
  }

  private get(key: string): Cached | undefined {
    const row = this.readCache.get(key)
    return row ? JSON.parse(row.value as string) : undefined
  }

  private put(key: string, value: Cached) {
    this.writeCache.run(key, JSON.stringify(value))
  }

  async build(input: Input, output: string, compilerId: string) {
    const started = performance.now()
    const timingsMs: Record<string, number> = {}
    const emitterMs: Record<string, number> = {}
    let stage = performance.now()
    const cfg = await this.configuration
    timingsMs.configuration = performance.now() - stage
    const files = Object.keys(input.files).sort() as FilePath[]
    if (!files.some((name) => name.endsWith(".md"))) throw new Error("Refusing empty source")
    const ctx: BuildCtx = {
      cfg,
      buildId: digest([compilerId, input.files]),
      allFiles: files,
      allSlugs: files.map((filename) => slugifyFilePath(filename)),
      incremental: true,
      virtualPages: [],
      argv: {
        directory: input.directory,
        output,
        verbose: false,
        serve: false,
        watch: false,
        port: 0,
        wsPort: 0,
        concurrency: 1,
      },
    }
    // Source mirrors have no authoritative Git history. Use frontmatter or original
    // mirror timestamps, rather than the temporary snapshot's birth time.
    ctx.cfg = {
      ...cfg,
      plugins: {
        ...cfg.plugins,
        transformers: cfg.plugins.transformers.map((plugin) =>
          plugin.name !== "CreatedModifiedDate"
            ? plugin
            : {
                name: plugin.name,
                markdownPlugins: () => [
                  () => (_tree: unknown, file: VFile) => {
                    const source = input.files[file.data.relativePath!]
                    const fm = (file.data.frontmatter ?? {}) as Record<string, unknown>
                    const date = (value: unknown, fallback: number) => {
                      const result = new Date((value ?? fallback) as string | number)
                      if (!Number.isFinite(result.getTime()))
                        throw new Error(`Invalid date: ${file.path}`)
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
      },
    }
    const namespace = digest([compilerId, files])
    // Give generated pages stable dates, rather than emitter fallbacks to wall-clock time.
    const latestTime = Math.max(...Object.values(input.files).map((info) => info.mtimeMs), 0)
    ctx.cfg.plugins.pageTypes = cfg.plugins.pageTypes?.map((entry) => {
      const pt = entry as unknown as QuartzPageTypePluginInstance
      if (!pt.generate) return pt
      const generate = pt.generate
      return {
        ...pt,
        generate: (args: Parameters<typeof generate>[0]) =>
          generate(args).map((page) => ({
            ...page,
            data: {
              defaultDateType: "modified",
              dates: {
                created: new Date(latestTime),
                modified: new Date(latestTime),
                published: new Date(latestTime),
              },
              ...page.data,
            },
          })),
      }
    })
    stage = performance.now()
    const md = createMdProcessor(ctx)
    const markdown: { key: string; tree: MarkdownRoot; file: VFile }[] = []
    let parsed = 0
    let transformed = 0
    const content: ProcessedContent[] = []
    this.db.exec("BEGIN")
    try {
      for (const relative of files.filter((name) => name.endsWith(".md"))) {
        const key = digest(["md", namespace, relative, input.files[relative]])
        const cached = this.get(key)
        const file = new VFile({ path: path.join(input.directory, relative) })
        if (cached) {
          restore(file, cached.data)
          file.value = cached.value ?? ""
          ctx.allSlugs.push(...((file.data.aliases as FullSlug[] | undefined) ?? []))
          markdown.push({ key, tree: cached.tree as MarkdownRoot, file })
        } else {
          file.value = (await fs.readFile(file.path, "utf8")).trim()
          file.data.filePath = file.path as FilePath
          file.data.relativePath = relative
          file.data.slug = slugifyFilePath(relative)
          for (const plugin of ctx.cfg.plugins.transformers) {
            if (plugin.textTransform) file.value = plugin.textTransform(ctx, file.toString())
          }
          const tree = await md.run(md.parse(file), file)
          this.put(key, { tree, data: cacheData(file), value: file.toString() })
          markdown.push({ key, tree, file })
          parsed++
        }
      }
      timingsMs.markdown = performance.now() - stage
      stage = performance.now()
      ctx.allSlugs = [...new Set(ctx.allSlugs)].sort()
      const resolvedNamespace = digest(ctx.allSlugs)
      const html = createHtmlProcessor(ctx)
      for (const item of markdown) {
        const key = digest(["html", item.key, resolvedNamespace])
        const cached = this.get(key)
        if (cached) {
          restore(item.file, cached.data)
          content.push([cached.tree as Root, item.file])
        } else {
          const tree = await html.run(structuredClone(item.tree), item.file)
          this.put(key, { tree, data: cacheData(item.file) })
          content.push([tree, item.file])
          transformed++
        }
      }
      this.db.exec("COMMIT")
    } catch (error) {
      this.db.exec("ROLLBACK")
      throw error
    }
    timingsMs.html = performance.now() - stage
    if (detectSlugCollisions(content).length) throw new Error("Duplicate article slugs")
    const published = filterContent(ctx, content)
    if (!published.length) throw new Error("Refusing to publish zero articles")
    await fs.mkdir(output, { recursive: false })
    const resources = getStaticResourcesFromPlugins(ctx)
    const emit = async (emitter: QuartzEmitterPluginInstance, pages = published) => {
      // Do not use the development emitter wrapper: any error must abort publication.
      const emitted = await emitter.emit(ctx, pages, resources)
      if (Symbol.asyncIterator in emitted) {
        for await (const _file of emitted) {
          /* Exhaust the generator and propagate errors. */
        }
      }
    }
    stage = performance.now()
    const componentResources = cfg.plugins.emitters.find((e) => e.name === "ComponentResources")
    if (componentResources) {
      if (this.resources) {
        await fs.cp(this.resources.directory, output, { recursive: true })
        Object.assign(ctx, structuredClone(this.resources.data))
      } else {
        await emit(componentResources)
        const directory = path.join(this.state, "component-resources")
        await fs.rm(directory, { recursive: true, force: true })
        await fs.cp(output, directory, { recursive: true })
        this.resources = {
          directory,
          data: {
            hashedResourceNames: ctx.hashedResourceNames,
            componentCssMap: ctx.componentCssMap,
            extractedInlineResources: ctx.extractedInlineResources,
          },
        }
      }
    }
    timingsMs.resources = performance.now() - stage
    stage = performance.now()
    const dispatcher = cfg.plugins.emitters.find((e) => e.name === "PageTypeDispatcher")
    if (dispatcher) await emit(dispatcher)
    timingsMs.pages = performance.now() - stage
    let ogGenerated = 0
    let ogReused = 0
    const all = [...published, ...ctx.virtualPages]
    for (const emitter of cfg.plugins.emitters) {
      if (["ComponentResources", "PageTypeDispatcher"].includes(emitter.name)) continue
      const emitterStart = performance.now()
      if (emitter.name === "CustomOgImages") {
        // OG images can be expensive. Cache each page's output independently.
        for (const page of all) {
          if (await this.emitOg(emitter, ctx, page, resources, compilerId)) ogGenerated++
          else ogReused++
        }
      } else await emit(emitter, all)
      emitterMs[emitter.name] = performance.now() - emitterStart
    }
    timingsMs.total = performance.now() - started
    return {
      timingsMs,
      emitterMs,
      ogGenerated,
      ogReused,
      parsed,
      transformed,
      reused: markdown.length - transformed,
      articles: published.length,
    }
  }

  private async emitOg(
    emitter: QuartzEmitterPluginInstance,
    ctx: BuildCtx,
    page: ProcessedContent,
    resources: StaticResources,
    compilerId: string,
  ) {
    const data = cacheData(page[1])
    const { htmlAst: _ast, blocks: _blocks, ...metadata } = data
    const key = digest([compilerId, metadata])
    const directory = path.join(this.state, "og-cache", key)
    try {
      const paths: string[] = JSON.parse(
        await fs.readFile(path.join(directory, "files.json"), "utf8"),
      )
      for (const relative of paths) {
        const target = path.join(ctx.argv.output, relative)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.copyFile(path.join(directory, "assets", relative), target)
      }
      return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    const paths: string[] = []
    const emitted = await emitter.emit(ctx, [page], resources)
    const save = async (filename: string) => {
      const relative = path.relative(ctx.argv.output, filename)
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("Unsafe OG output")
      paths.push(relative)
      const target = path.join(directory, "assets", relative)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.copyFile(filename, target)
    }
    if (Symbol.asyncIterator in emitted) {
      for await (const filename of emitted) await save(filename)
    } else for (const filename of emitted) await save(filename)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, "files.json"), JSON.stringify(paths))
    return true
  }

  close() {
    this.db.close()
  }
}
