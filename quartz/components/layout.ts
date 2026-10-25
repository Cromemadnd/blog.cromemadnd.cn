import { FullPageLayout } from "../cfg"
import { QuartzComponent, QuartzComponentConstructor } from "./types"
import { componentRegistry } from "./registry"
import { getCondition } from "../plugins/loader/conditions"
import {
  FlexGroupConfig,
  LayoutConfig,
  PluginJsonEntry,
  PluginLayoutDeclaration,
  PluginSource,
  QuartzPluginsJson,
} from "../plugins/loader/types"
import Head from "./Head"
import Flex from "./Flex"
import MobileOnly from "./MobileOnly"
import DesktopOnly from "./DesktopOnly"
import ConditionalRender from "./ConditionalRender"

function extractPluginName(source: PluginSource): string {
  const value = typeof source === "object" ? source.repo : source
  return value
    .split("#")[0]
    .replace(/\.git$/, "")
    .split("/")
    .pop()!
}

function formatSourceDisplay(source: PluginSource): string {
  return typeof source === "object" ? source.repo : source
}

/** Pure layout assembly shared by the Node compiler and the Workers renderer. */
export function buildQuartzLayout(
  json: QuartzPluginsJson,
  layoutOverrides?: {
    defaults?: Partial<FullPageLayout>
    byPageType?: Record<string, Partial<FullPageLayout>>
  },
): { defaults: Partial<FullPageLayout>; byPageType: Record<string, Partial<FullPageLayout>> } {
  const enabledWithLayout = json.plugins.filter((e) => e.enabled && e.layout)
  const layoutConfig = json.layout ?? {}

  // Build default layout for all page types
  const defaultLayout = buildLayoutForEntries(enabledWithLayout, layoutConfig)

  // Build per-page-type overrides
  const byPageType: Record<string, Partial<FullPageLayout>> = {}
  if (layoutConfig.byPageType) {
    for (const [pageType, override] of Object.entries(layoutConfig.byPageType)) {
      let filteredEntries = enabledWithLayout

      // Apply exclusions
      if (override.exclude?.length) {
        filteredEntries = filteredEntries.filter((e) => {
          const name = extractPluginName(e.source)
          return !override.exclude!.includes(name)
        })
      }

      const ptLayout = buildLayoutForEntries(filteredEntries, layoutConfig)

      // Apply position overrides (empty array = clear position)
      if (override.positions) {
        for (const [pos, components] of Object.entries(override.positions)) {
          if (Array.isArray(components) && components.length === 0) {
            const key = pos as keyof Pick<
              FullPageLayout,
              "left" | "right" | "beforeBody" | "afterBody"
            >
            if (key in ptLayout) {
              ;(ptLayout as Record<string, unknown>)[key] = []
            }
          }
        }
      }

      // Apply frame template override
      if (override.template) {
        ptLayout.frame = override.template
      }

      byPageType[pageType] = ptLayout
    }
  }

  // Add Head (built-in) and Footer (plugin)
  const head = Head()

  // Find footer from component registry (loaded during plugin instantiation)
  const footerEntry = json.plugins.find(
    (e) => e.enabled && extractPluginName(e.source) === "footer",
  )
  let footer: QuartzComponent | undefined
  if (footerEntry) {
    // Try registry lookup: plugin name ("footer") or export name ("Footer")
    const footerReg = componentRegistry.get("footer") ?? componentRegistry.get("Footer")
    if (footerReg) {
      if (typeof footerReg.component === "function" && !("displayName" in footerReg.component)) {
        // It's a constructor — use registry cache for consistent instances
        const footerOverrides = componentRegistry.getOptionOverrides("footer")
        const opts = { ...footerEntry.options, ...footerOverrides }
        footer = componentRegistry.instantiate(
          footerReg.component as QuartzComponentConstructor,
          Object.keys(opts).length > 0 ? opts : undefined,
        )
      } else {
        footer = footerReg.component as QuartzComponent
      }
    }
  }

  // Apply structural defaults
  defaultLayout.head = head
  defaultLayout.header = defaultLayout.header ?? []
  if (footer) {
    defaultLayout.footer = footer
  }

  // Ensure all byPageType entries inherit structural slots
  for (const pageType of Object.keys(byPageType)) {
    const pt = byPageType[pageType]
    if (!pt.head) pt.head = head
    if (!pt.header) pt.header = []
    if (footer && !pt.footer) pt.footer = footer
  }

  const mergedDefaults = { ...defaultLayout, ...layoutOverrides?.defaults }
  const mergedByPageType = { ...byPageType }
  if (layoutOverrides?.byPageType) {
    for (const [pageType, overrideLayout] of Object.entries(layoutOverrides.byPageType)) {
      mergedByPageType[pageType] = { ...mergedByPageType[pageType], ...overrideLayout }
    }
  }

  return { defaults: mergedDefaults, byPageType: mergedByPageType }
}

function buildLayoutForEntries(
  entries: PluginJsonEntry[],
  layoutConfig: LayoutConfig,
): Partial<FullPageLayout> {
  const positions: Record<
    string,
    {
      component: QuartzComponent
      priority: number
      group?: string
      groupOptions?: PluginLayoutDeclaration["groupOptions"]
    }[]
  > = {
    left: [],
    right: [],
    beforeBody: [],
    afterBody: [],
  }

  for (const entry of entries) {
    if (!entry.layout) continue

    const layout = entry.layout
    const name = extractPluginName(entry.source)

    // Look up component from registry
    const registered =
      componentRegistry.get(name) ??
      componentRegistry.get(`${formatSourceDisplay(entry.source)}/${name}`)
    if (!registered) {
      // Try common naming patterns
      const pascalName = name
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("")
      const altRegistered = componentRegistry.get(pascalName)
      if (!altRegistered) continue
    }

    const reg =
      registered ??
      componentRegistry.get(
        name
          .split("-")
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(""),
      )
    if (!reg) continue

    let component: QuartzComponent
    if (typeof reg.component === "function" && !("displayName" in reg.component)) {
      // It's a constructor — use registry cache to avoid duplicate instances
      // (and duplicate afterDOMLoaded scripts) across page-type layouts
      const tsOverrides = componentRegistry.getOptionOverrides(name)
      const opts = { ...entry.options, ...tsOverrides }
      const optsArg = Object.keys(opts).length > 0 ? opts : undefined
      component = componentRegistry.instantiate(
        reg.component as QuartzComponentConstructor,
        optsArg,
      )
    } else {
      component = reg.component as QuartzComponent
    }

    // Apply display modifier
    if (layout.display && layout.display !== "all") {
      component = applyDisplayWrapper(component, layout.display)
    }

    // Apply condition
    if (layout.condition) {
      component = applyConditionWrapper(component, layout.condition)
    }

    const posArray = positions[layout.position]
    if (posArray) {
      posArray.push({
        component,
        priority: layout.priority,
        group: layout.group,
        groupOptions: layout.groupOptions,
      })
    }
  }

  // Sort by priority and resolve groups
  const result: Partial<FullPageLayout> = {}

  for (const [position, items] of Object.entries(positions)) {
    items.sort((a, b) => a.priority - b.priority)

    const resolved = resolveGroups(items, layoutConfig.groups ?? {})
    const key = position as keyof Pick<
      FullPageLayout,
      "left" | "right" | "beforeBody" | "afterBody"
    >
    ;(result as Record<string, QuartzComponent[]>)[key] = resolved
  }

  return result
}

function resolveGroups(
  items: {
    component: QuartzComponent
    priority: number
    group?: string
    groupOptions?: PluginLayoutDeclaration["groupOptions"]
  }[],
  groups: Record<string, FlexGroupConfig>,
): QuartzComponent[] {
  // Collect grouped components and track the effective priority for each group.
  // Effective priority = explicit group config priority ?? first member's priority.
  const groupedComponents = new Map<
    string,
    { component: QuartzComponent; groupOptions?: PluginLayoutDeclaration["groupOptions"] }[]
  >()
  const groupPriority = new Map<string, number>()

  for (const item of items) {
    if (item.group) {
      if (!groupedComponents.has(item.group)) {
        groupedComponents.set(item.group, [])
        // Use explicit group priority from config if set, otherwise fall back to first member's priority
        const groupConfig = groups[item.group]
        groupPriority.set(item.group, groupConfig?.priority ?? item.priority)
      }
      const groupMembers = groupedComponents.get(item.group)
      if (groupMembers) {
        groupMembers.push({
          component: item.component,
          groupOptions: item.groupOptions,
        })
      }
    }
  }

  // Build a unified list of renderable entries (ungrouped components + flex groups),
  // each with a priority, so we can sort them together.
  type RenderEntry = { priority: number; component: QuartzComponent }
  const entries: RenderEntry[] = []
  const processedGroups = new Set<string>()

  for (const item of items) {
    if (item.group) {
      // Only emit the flex group once (on first encounter)
      if (processedGroups.has(item.group)) continue
      processedGroups.add(item.group)

      const members = groupedComponents.get(item.group)
      if (!members) continue
      const groupConfig = groups[item.group] ?? {}

      const flexComponents = members.map((m) => ({
        Component: m.component,
        grow: m.groupOptions?.grow,
        shrink: m.groupOptions?.shrink,
        basis: m.groupOptions?.basis,
        order: m.groupOptions?.order,
        align: m.groupOptions?.align,
        justify: m.groupOptions?.justify,
      }))

      // Dynamically import Flex to avoid circular dependencies
      const flexComponent = Flex({
        components: flexComponents,
        direction: groupConfig.direction ?? "row",
        wrap: groupConfig.wrap,
        gap: groupConfig.gap ?? "1rem",
      }) as QuartzComponent

      entries.push({ priority: groupPriority.get(item.group) ?? 50, component: flexComponent })
    } else {
      entries.push({ priority: item.priority, component: item.component })
    }
  }

  // Stable sort by priority (items already arrive sorted, so equal priorities preserve order)
  entries.sort((a, b) => a.priority - b.priority)

  return entries.map((e) => e.component)
}

function applyDisplayWrapper(
  component: QuartzComponent,
  display: "mobile-only" | "desktop-only",
): QuartzComponent {
  if (display === "mobile-only") {
    return MobileOnly(component) as QuartzComponent
  } else {
    return DesktopOnly(component) as QuartzComponent
  }
}

function applyConditionWrapper(component: QuartzComponent, conditionName: string): QuartzComponent {
  const predicate = getCondition(conditionName)
  if (!predicate) {
    console.warn(`⚠` + ` Unknown condition "${conditionName}". Component will always render.`)
    return component
  }

  return ConditionalRender({
    component,
    condition: predicate,
  }) as QuartzComponent
}
