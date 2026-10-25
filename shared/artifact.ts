import type { Root } from "hast"
import type { GlobalConfiguration } from "../quartz/cfg"
import type { CSSResource, JSResource } from "../quartz/util/resources"

export const ARTIFACT_VERSION = 1 as const

export interface ObjectRef {
  key: string
  hash: string
  contentType: string
  size: number
}

export interface PageArtifact {
  version: typeof ARTIFACT_VERSION
  slug: string
  layout: string
  frame: string
  /** The complete page body, including its article/list wrapper; compiled on Node. */
  body: Root
  data: Record<string, unknown>
  resources: { css: CSSResource[]; js: JSResource[]; additionalHead: string[] }
}

export interface PageEntry {
  slug: string
  title: string
  layout: string
  unlisted: boolean
  data: Record<string, unknown>
  object: ObjectRef
}

export interface SiteArtifact {
  version: typeof ARTIFACT_VERSION
  releaseId: string
  rendererId: string
  configuration: GlobalConfiguration
  pages: Record<string, PageEntry>
  assets: Record<string, ObjectRef>
  redirects: Record<string, string>
  emitterNames: string[]
}

export interface Release {
  id: string
  rendererId: string
  manifest: ObjectRef
  site: SiteArtifact
}

/** Dates have an explicit wire representation; arbitrary strings are never revived. */
export function revivePageData(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data }
  if (data.dates && typeof data.dates === "object") {
    result.dates = Object.fromEntries(
      Object.entries(data.dates).map(([key, value]) => [key, new Date(value as string)]),
    )
  }
  return result
}

export function assertArtifactVersion(value: { version: number }): void {
  if (value.version !== ARTIFACT_VERSION) {
    throw new Error(`Unsupported artifact version: ${value.version}`)
  }
}
