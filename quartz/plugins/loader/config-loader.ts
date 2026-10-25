import fs from "fs"
import path from "path"
import YAML from "yaml"
import { styleText } from "util"
import { QuartzConfig, GlobalConfiguration, FullPageLayout } from "../../cfg"
import { PluginTypes } from "../types"
import { PluginManifest, PluginJsonEntry, PluginSource, QuartzPluginsJson } from "./types"
import {
  parsePluginSource,
  installPlugin,
  installNativeDeps,
  getPluginEntryPoint,
  toFileUrl,
  isLocalSource,
} from "./gitLoader"
import { loadComponentsFromPackage } from "./componentLoader"
import { loadFramesFromPackage } from "./frameLoader"
import { componentRegistry } from "../../components/registry"
import { buildQuartzLayout } from "../../components/layout"

const CONFIG_YAML_PATH = path.join(process.cwd(), "quartz.config.yaml")
const DEFAULT_CONFIG_YAML_PATH = path.join(process.cwd(), "quartz.config.default.yaml")
const LEGACY_PLUGINS_JSON_PATH = path.join(process.cwd(), "quartz.plugins.json")
const LEGACY_DEFAULT_PLUGINS_JSON_PATH = path.join(process.cwd(), "quartz.plugins.default.json")

function resolveConfigPath(): string {
  if (fs.existsSync(CONFIG_YAML_PATH)) return CONFIG_YAML_PATH
  if (fs.existsSync(LEGACY_PLUGINS_JSON_PATH)) return LEGACY_PLUGINS_JSON_PATH
  if (fs.existsSync(DEFAULT_CONFIG_YAML_PATH)) return DEFAULT_CONFIG_YAML_PATH
  if (fs.existsSync(LEGACY_DEFAULT_PLUGINS_JSON_PATH)) return LEGACY_DEFAULT_PLUGINS_JSON_PATH
  return CONFIG_YAML_PATH
}
function readPluginsJson(): QuartzPluginsJson | null {
  const configPath = resolveConfigPath()
  if (!fs.existsSync(configPath)) {
    return null
  }
  const raw = fs.readFileSync(configPath, "utf-8")
  if (configPath.endsWith(".yaml") || configPath.endsWith(".yml")) {
    return YAML.parse(raw) as QuartzPluginsJson
  }
  return JSON.parse(raw) as QuartzPluginsJson
}

function extractPluginName(source: PluginSource): string {
  if (typeof source === "object" && source !== null) {
    if (source.name) return source.name
    return extractPluginName(source.repo)
  }

  if (isLocalSource(source)) {
    return path.basename(source.replace(/[\/]+$/, ""))
  }
  if (source.startsWith("github:")) {
    const withoutPrefix = source.replace("github:", "")
    const [repoPath] = withoutPrefix.split("#")
    const parts = repoPath.split("/")
    return parts[parts.length - 1]
  }
  if (source.startsWith("git+") || source.startsWith("https://")) {
    const url = source.replace("git+", "")
    const match = url.match(/\/([^/]+?)(?:\.git)?(?:#|$)/)
    return match?.[1] ?? source
  }
  return source
}

function formatSourceDisplay(source: PluginSource): string {
  if (typeof source === "string") return source
  const parts = [source.repo]
  if (source.subdir) parts.push(`(subdir: ${source.subdir})`)
  if (source.ref) parts.push(`(ref: ${source.ref})`)
  return parts.join(" ")
}

function sourceKey(source: PluginSource): string {
  if (typeof source === "string") return source
  return JSON.stringify(source)
}

interface DependencyValidationResult {
  errors: string[]
  warnings: string[]
}

function validateDependencies(
  entries: PluginJsonEntry[],
  manifests: Map<string, PluginManifest>,
): DependencyValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const sourceToEntry = new Map<string, PluginJsonEntry>()
  const nameToSource = new Map<string, string>()
  for (const entry of entries) {
    sourceToEntry.set(sourceKey(entry.source), entry)
    nameToSource.set(extractPluginName(entry.source), sourceKey(entry.source))
  }

  for (const entry of entries) {
    if (!entry.enabled) continue
    const manifest = manifests.get(sourceKey(entry.source))
    if (!manifest?.dependencies?.length) continue

    const pluginName = manifest.displayName || extractPluginName(entry.source)
    const pluginOrder = entry.order ?? manifest.defaultOrder ?? 50

    for (const dep of manifest.dependencies) {
      const depEntry = sourceToEntry.get(dep)
      const depName = extractPluginName(dep)

      if (!depEntry) {
        errors.push(
          `Plugin "${pluginName}" requires "${depName}". Run: npx quartz plugin add ${dep}`,
        )
        continue
      }

      if (!depEntry.enabled) {
        warnings.push(
          `Plugin "${pluginName}" depends on "${depName}" which is disabled. "${pluginName}" may not function correctly.`,
        )
      }

      const depManifest = manifests.get(dep)
      const depOrder = depEntry.order ?? depManifest?.defaultOrder ?? 50

      if (pluginOrder < depOrder) {
        errors.push(
          `Plugin "${pluginName}" (order: ${pluginOrder}) depends on "${depName}" (order: ${depOrder}), ` +
            `but "${pluginName}" is configured to run first. Either increase "${pluginName}"'s order above ${depOrder} ` +
            `or decrease "${depName}"'s order below ${pluginOrder}.`,
        )
      }
    }
  }

  const graph = new Map<string, string[]>()
  for (const entry of entries) {
    const manifest = manifests.get(sourceKey(entry.source))
    if (manifest?.dependencies?.length) {
      graph.set(sourceKey(entry.source), manifest.dependencies)
    }
  }

  const visited = new Set<string>()
  const inStack = new Set<string>()

  function detectCycle(node: string, pathSoFar: string[]): string[] | null {
    if (inStack.has(node)) {
      const cycleStart = pathSoFar.indexOf(node)
      return pathSoFar.slice(cycleStart).concat(node)
    }
    if (visited.has(node)) return null

    visited.add(node)
    inStack.add(node)

    for (const dep of graph.get(node) ?? []) {
      const cycle = detectCycle(dep, [...pathSoFar, node])
      if (cycle) return cycle
    }

    inStack.delete(node)
    return null
  }

  for (const node of graph.keys()) {
    const cycle = detectCycle(node, [])
    if (cycle) {
      const names = cycle.map(extractPluginName)
      errors.push(`Circular dependency detected: ${names.join(" → ")}`)
      break
    }
  }

  return { errors, warnings }
}

async function resolvePluginManifest(source: PluginSource): Promise<PluginManifest | null> {
  try {
    const gitSpec = parsePluginSource(source)
    const entryPoint = getPluginEntryPoint(gitSpec.name)
    const module = await import(toFileUrl(entryPoint))
    return module.manifest ?? null
  } catch {
    return null
  }
}

async function readManifestFromPackageJson(source: PluginSource): Promise<PluginManifest | null> {
  try {
    const gitSpec = parsePluginSource(source)
    const pluginDir = path.join(process.cwd(), ".quartz", "plugins", gitSpec.name)
    const pkgPath = path.join(pluginDir, "package.json")
    if (!fs.existsSync(pkgPath)) return null

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"))
    if (!pkg.quartz) return null

    const q = pkg.quartz
    return {
      name: q.name ?? gitSpec.name,
      displayName: q.displayName ?? q.name ?? gitSpec.name,
      description: q.description ?? pkg.description ?? "No description",
      version: q.version ?? pkg.version ?? "1.0.0",
      author: q.author ?? pkg.author,
      homepage: q.homepage ?? pkg.homepage,
      category: q.category,
      quartzVersion: q.quartzVersion,
      dependencies: q.dependencies,
      defaultOrder: q.defaultOrder,
      defaultEnabled: q.defaultEnabled,
      defaultOptions: q.defaultOptions,
      configSchema: q.configSchema,
      components: q.components,
      frames: q.frames,
    }
  } catch {
    return null
  }
}

async function getManifest(source: PluginSource): Promise<PluginManifest | null> {
  // Try package.json quartz field first (preferred), then fall back to manifest.ts export
  return (await readManifestFromPackageJson(source)) ?? (await resolvePluginManifest(source))
}

export async function loadQuartzConfig(
  configOverrides?: Partial<GlobalConfiguration>,
  loaderOptions: { strict?: boolean; excludePlugins?: string[] } = {},
): Promise<QuartzConfig> {
  const json = readPluginsJson()

  if (!json) {
    // Fallback: import old-style config directly
    const oldConfig = await import("../../../quartz")
    return oldConfig.default
  }

  const configuration = {
    ...(json.configuration as unknown as GlobalConfiguration),
    ...configOverrides,
  }

  const enabledEntries = json.plugins.filter(
    (e) => e.enabled && !loaderOptions.excludePlugins?.includes(extractPluginName(e.source)),
  )
  const manifests = new Map<string, PluginManifest>()

  // Ensure all plugins are installed and collect native deps
  const allNativeDeps = new Map<string, Map<string, string>>()
  for (const entry of enabledEntries) {
    try {
      const gitSpec = parsePluginSource(entry.source)
      const result = await installPlugin(gitSpec, { verbose: false })
      if (result.nativeDeps.size > 0) {
        allNativeDeps.set(gitSpec.name, result.nativeDeps)
      }
    } catch (err) {
      if (loaderOptions.strict) throw err
      console.error(
        styleText("red", `✗`) +
          ` Failed to install plugin: ${styleText("yellow", formatSourceDisplay(entry.source))}\n` +
          `  ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (allNativeDeps.size > 0) {
    installNativeDeps(allNativeDeps, { verbose: false })
  }

  // Collect manifests (requires native deps to be installed first)
  for (const entry of enabledEntries) {
    try {
      const manifest = await getManifest(entry.source)
      if (manifest) {
        manifests.set(sourceKey(entry.source), manifest)
      } else if (loaderOptions.strict)
        throw new Error(`Missing plugin manifest: ${extractPluginName(entry.source)}`)
    } catch (err) {
      if (loaderOptions.strict) throw err
      console.error(
        styleText("red", `✗`) +
          ` Failed to load manifest: ${styleText("yellow", formatSourceDisplay(entry.source))}\n` +
          `  ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  // Validate dependencies
  const validation = validateDependencies(enabledEntries, manifests)
  for (const warning of validation.warnings) {
    console.warn(styleText("yellow", `⚠`) + ` ${warning}`)
  }
  if (validation.errors.length > 0) {
    for (const error of validation.errors) {
      console.error(styleText("red", `✗`) + ` ${error}`)
    }
    throw new Error(
      `Plugin dependency validation failed with ${validation.errors.length} error(s). See above for details.`,
    )
  }

  // Categorize and sort plugins
  const transformers: { entry: PluginJsonEntry; manifest: PluginManifest | undefined }[] = []
  const filters: { entry: PluginJsonEntry; manifest: PluginManifest | undefined }[] = []
  const emitters: { entry: PluginJsonEntry; manifest: PluginManifest | undefined }[] = []
  const pageTypes: { entry: PluginJsonEntry; manifest: PluginManifest | undefined }[] = []

  for (const entry of enabledEntries) {
    const manifest = manifests.get(sourceKey(entry.source))
    const category = manifest?.category
    // Resolve processing categories: for array categories (e.g. ["transformer", "pageType", "component"]),
    // push the plugin into ALL matching processing category buckets.
    // "component" is handled separately via loadComponentsFromPackage during instantiation.
    const processingCategories = ["transformer", "filter", "emitter", "pageType"] as const
    const categoryMap: Record<string, typeof transformers> = {
      transformer: transformers,
      filter: filters,
      emitter: emitters,
      pageType: pageTypes,
    }

    const categories = Array.isArray(category) ? category : category ? [category] : []
    const matchedProcessing = categories.filter((c) =>
      (processingCategories as readonly string[]).includes(c),
    )

    if (matchedProcessing.length > 0) {
      for (const cat of matchedProcessing) {
        categoryMap[cat].push({ entry, manifest })
      }
    } else {
      const gitSpec = parsePluginSource(entry.source)
      const isComponentOnly = categories.length > 0 && categories.every((c) => c === "component")

      if (isComponentOnly) {
        // Always import the main entry point for component-only plugins.
        // Some plugins (e.g. Bases view registrations) rely on side effects
        // in their index module to register functionality.
        const entryPoint = getPluginEntryPoint(gitSpec.name)
        try {
          const module = await import(toFileUrl(entryPoint))
          // If the module exports an init() function, call it with merged options
          // so component-only plugins can receive user configuration from YAML.
          if (typeof module.init === "function") {
            const initOverrides = componentRegistry.getOptionOverrides(gitSpec.name)
            const options = { ...manifest?.defaultOptions, ...entry.options, ...initOverrides }
            await module.init(Object.keys(options).length > 0 ? options : undefined)
          }
        } catch (e) {
          if (loaderOptions.strict) throw e
          // Side-effect import failed — continue with manifest-based loading
        }
        if (manifest?.components && Object.keys(manifest.components).length > 0) {
          await loadComponentsFromPackage(gitSpec.name, manifest, loaderOptions.strict)
        }
        if (manifest?.frames && Object.keys(manifest.frames).length > 0) {
          await loadFramesFromPackage(gitSpec.name, manifest, loaderOptions.strict)
        }
      } else {
        const entryPoint = getPluginEntryPoint(gitSpec.name)
        try {
          const module = await import(toFileUrl(entryPoint))
          const detected = detectCategoryFromModule(module)
          if (detected) {
            categoryMap[detected].push({ entry, manifest })
          } else if (manifest?.components && Object.keys(manifest.components).length > 0) {
            await loadComponentsFromPackage(gitSpec.name, manifest, loaderOptions.strict)
            if (manifest?.frames && Object.keys(manifest.frames).length > 0) {
              await loadFramesFromPackage(gitSpec.name, manifest, loaderOptions.strict)
            }
          } else {
            console.warn(
              styleText("yellow", `⚠`) +
                ` Could not determine category for plugin "${extractPluginName(entry.source)}". Skipping.`,
            )
          }
        } catch (error) {
          if (loaderOptions.strict) throw error
          const hasComponents = manifest?.components && Object.keys(manifest.components).length > 0
          const hasFrames = manifest?.frames && Object.keys(manifest.frames).length > 0
          if (hasComponents) {
            await loadComponentsFromPackage(gitSpec.name, manifest, loaderOptions.strict)
          }
          if (hasFrames) {
            await loadFramesFromPackage(gitSpec.name, manifest, loaderOptions.strict)
          }
          if (!hasComponents && !hasFrames) {
            console.warn(
              styleText("yellow", `⚠`) +
                ` Could not load plugin "${extractPluginName(entry.source)}" to detect category. Skipping.`,
            )
          }
        }
      }
    }
  }

  // Sort by order within each category
  const sortByOrder = (
    a: { entry: PluginJsonEntry; manifest: PluginManifest | undefined },
    b: { entry: PluginJsonEntry; manifest: PluginManifest | undefined },
  ) => {
    const orderA = a.entry.order ?? a.manifest?.defaultOrder ?? 50
    const orderB = b.entry.order ?? b.manifest?.defaultOrder ?? 50
    return orderA - orderB
  }

  transformers.sort(sortByOrder)
  filters.sort(sortByOrder)
  emitters.sort(sortByOrder)
  pageTypes.sort(sortByOrder)

  // Instantiate plugins
  const instantiate = async (
    items: { entry: PluginJsonEntry; manifest: PluginManifest | undefined }[],
    expectedCategory: ProcessingCategory,
  ) => {
    const instances = []
    for (const { entry, manifest } of items) {
      try {
        const gitSpec = parsePluginSource(entry.source)
        const entryPoint = getPluginEntryPoint(gitSpec.name)
        const module = await import(toFileUrl(entryPoint))
        if (manifest?.components && Object.keys(manifest.components).length > 0) {
          await loadComponentsFromPackage(gitSpec.name, manifest, loaderOptions.strict)
        }
        if (manifest?.frames && Object.keys(manifest.frames).length > 0) {
          await loadFramesFromPackage(gitSpec.name, manifest, loaderOptions.strict)
        }

        const factory = findFactory(module, expectedCategory)
        if (!factory) {
          if (loaderOptions.strict)
            throw new Error(`No ${expectedCategory} factory: ${extractPluginName(entry.source)}`)
          console.warn(
            styleText("yellow", `⚠`) +
              ` Plugin "${extractPluginName(entry.source)}" has no factory function for category "${expectedCategory}". ` +
              `Ensure your plugin exports a default function, a "plugin" named export, or a single exported function.`,
          )
          continue
        }
        const pluginOverrides = componentRegistry.getOptionOverrides(gitSpec.name)
        const options = { ...manifest?.defaultOptions, ...entry.options, ...pluginOverrides }
        const instance = factory(Object.keys(options).length > 0 ? options : undefined)
        if (!instance || typeof instance !== "object") {
          if (loaderOptions.strict)
            throw new Error(`Invalid plugin instance: ${extractPluginName(entry.source)}`)
          console.warn(
            styleText("yellow", `⚠`) +
              ` Plugin "${extractPluginName(entry.source)}" factory did not return a valid plugin instance. Skipping.`,
          )
          continue
        }
        if (!validateCategory(instance, expectedCategory)) {
          if (loaderOptions.strict)
            throw new Error(`Invalid plugin category: ${extractPluginName(entry.source)}`)
          console.warn(
            styleText("yellow", `⚠`) +
              ` Plugin "${extractPluginName(entry.source)}" declares category "${expectedCategory}" ` +
              `but its factory returned an instance missing the required methods. Skipping.`,
          )
          continue
        }
        instances.push(instance)
      } catch (err) {
        if (loaderOptions.strict) throw err
        console.error(
          styleText("red", `✗`) +
            ` Failed to instantiate plugin "${extractPluginName(entry.source)}": ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
    return instances
  }

  // Import built-in plugins
  const builtinPlugins = await import("../index")
  const builtinTransformers: unknown[] = []
  const builtinEmitters = [
    builtinPlugins.ComponentResources(),
    builtinPlugins.Assets(),
    builtinPlugins.Static(),
  ]
  const builtinPageTypes = [builtinPlugins.PageTypes.NotFoundPageType()]

  const plugins: PluginTypes = {
    transformers: [...builtinTransformers, ...(await instantiate(transformers, "transformer"))],
    filters: await instantiate(filters, "filter"),
    emitters: [...builtinEmitters, ...(await instantiate(emitters, "emitter"))],
    pageTypes: [...(await instantiate(pageTypes, "pageType")), ...builtinPageTypes],
  }

  // Load layout and add PageTypeDispatcher to emitters.
  // This must happen after plugin instantiation so the component registry is populated.
  const layout = await loadQuartzLayout()
  plugins.emitters.push(
    builtinPlugins.PageTypes.PageTypeDispatcher({
      defaults: layout.defaults,
      byPageType: layout.byPageType,
    }),
  )
  return {
    configuration,
    plugins,
  }
}

type ProcessingCategory = "transformer" | "filter" | "emitter" | "pageType"

/**
 * Validate that a plugin instance has the required methods for its declared category.
 * Called AFTER real instantiation — never used to probe/discover category.
 */
function validateCategory(
  instance: Record<string, unknown>,
  expected: ProcessingCategory,
): boolean {
  switch (expected) {
    case "pageType":
      return "match" in instance && "body" in instance && "layout" in instance
    case "emitter":
      return "emit" in instance
    case "filter":
      return "shouldPublish" in instance
    case "transformer":
      return (
        "textTransform" in instance || "markdownPlugins" in instance || "htmlPlugins" in instance
      )
  }
}

/**
 * Find the factory function from a plugin module by export convention.
 * Prefers `default` export, then `plugin` named export, then the sole exported function.
 * For multi-export modules with an expectedCategory, probes candidate functions to find
 * the one matching the category shape.
 */
function findFactory(
  module: Record<string, unknown>,
  expectedCategory?: ProcessingCategory,
): Function | null {
  if (typeof module.default === "function") {
    return module.default as Function
  }
  if (typeof module.plugin === "function") {
    return module.plugin as Function
  }

  const exportedFunctions = Object.entries(module).filter(
    ([key, value]) => typeof value === "function" && !key.startsWith("__"),
  )

  if (exportedFunctions.length === 1) {
    return exportedFunctions[0][1] as Function
  }

  // Multiple exports: probe candidates to find the one matching the expected category.
  // This is the only code path that calls factory() for discovery, and only when
  // there is no default/plugin export and multiple functions are exported.
  if (exportedFunctions.length > 1 && expectedCategory) {
    for (const [, fn] of exportedFunctions) {
      try {
        const instance = (fn as Function)()
        if (
          instance &&
          typeof instance === "object" &&
          validateCategory(instance, expectedCategory)
        ) {
          return fn as Function
        }
      } catch {
        // This export doesn't work without args — skip it
      }
    }
  }

  return null
}

function detectCategoryFromModule(module: unknown): ProcessingCategory | null {
  if (!module || typeof module !== "object") return null
  const mod = module as Record<string, unknown>

  // Prefer static category marker on the factory if available
  const factory = findFactory(mod as Record<string, unknown>)
  if (factory && "quartzCategory" in factory) {
    const cat = (factory as Record<string, unknown>).quartzCategory
    if (cat === "transformer" || cat === "filter" || cat === "emitter" || cat === "pageType") {
      return cat
    }
  }

  // Fallback: try instantiating with no args and inspect the result.
  // This may fail for plugins that do I/O or require options during construction.
  if (typeof factory === "function") {
    try {
      const instance = factory()
      if (instance && typeof instance === "object") {
        if ("match" in instance && "body" in instance && "layout" in instance) return "pageType"
        if ("emit" in instance) return "emitter"
        if ("shouldPublish" in instance) return "filter"
        if (
          "textTransform" in instance ||
          "markdownPlugins" in instance ||
          "htmlPlugins" in instance
        )
          return "transformer"
      }
    } catch {
      // Factory requires arguments or does I/O — cannot detect category by probing.
      // Plugin should declare category in package.json quartz.category field.
    }
  }

  return null
}

export async function loadQuartzLayout(layoutOverrides?: {
  defaults?: Partial<FullPageLayout>
  byPageType?: Record<string, Partial<FullPageLayout>>
}): Promise<{
  defaults: Partial<FullPageLayout>
  byPageType: Record<string, Partial<FullPageLayout>>
}> {
  const json = readPluginsJson()
  if (!json) {
    const oldLayout = await import("../../../quartz")
    return oldLayout.layout
  }
  return buildQuartzLayout(json, layoutOverrides)
}
