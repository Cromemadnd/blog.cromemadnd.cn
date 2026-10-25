import type { D1Database, R2Bucket } from "@cloudflare/workers-types"
import {
  assertArtifactVersion,
  type SiteArtifact,
  type PageArtifact,
} from "../../../shared/artifact"
import { renderArtifact } from "./render"
import { rendererId } from "../../../.cloud/runtime-layout.mjs"

export interface Env {
  DB: D1Database
  CONTENT: R2Bucket
}
export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void
}
interface ReleaseRow {
  id: string
  renderer_id: string
  manifest_key: string
}

const manifests = new WeakMap<R2Bucket, Map<string, Promise<SiteArtifact>>>()
async function manifest(env: Env, release: ReleaseRow): Promise<SiteArtifact> {
  let cache = manifests.get(env.CONTENT)
  if (!cache) {
    cache = new Map()
    manifests.set(env.CONTENT, cache)
  }
  let result = cache.get(release.manifest_key)
  if (!result) {
    result = (async () => {
      const object = await env.CONTENT.get(release.manifest_key)
      if (!object) throw new Error("Published manifest is missing")
      const site = await object.json<SiteArtifact>()
      assertArtifactVersion(site)
      if (site.releaseId !== release.id || site.rendererId !== release.renderer_id)
        throw new Error("Manifest does not match the D1 release")
      return site
    })()
    cache.set(release.manifest_key, result)
    result.catch(() => cache!.delete(release.manifest_key))
    if (cache.size > 3) cache.delete(cache.keys().next().value!)
  }
  return result
}

function response(body: BodyInit | null, status: number, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: { "X-Content-Type-Options": "nosniff", ...headers },
  })
}

async function serveAsset(
  request: Request,
  env: Env,
  site: SiteArtifact,
  filename: string,
  immutable: boolean,
): Promise<Response | undefined> {
  if (!Object.hasOwn(site.assets, filename)) return undefined
  const ref = site.assets[filename]
  const headers = {
    "Content-Type": ref.contentType,
    "Cache-Control": immutable
      ? "public, max-age=31536000, immutable"
      : "public, max-age=0, must-revalidate",
    ETag: `"${ref.hash}"`,
    "Accept-Ranges": "bytes",
  }
  if (
    request.headers
      .get("If-None-Match")
      ?.split(/\s*,\s*/)
      .includes(headers.ETag)
  )
    return response(null, 304, headers)
  const rangeHeader = request.headers.get("Range")
  let range: { offset: number; length: number } | undefined
  if (
    rangeHeader &&
    (!request.headers.get("If-Range") || request.headers.get("If-Range") === headers.ETag)
  ) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
    if (!match || (!match[1] && !match[2]))
      return response(null, 416, { ...headers, "Content-Range": `bytes */${ref.size}` })
    const start = match[1] ? Number(match[1]) : Math.max(0, ref.size - Number(match[2]))
    const end = match[1] && match[2] ? Math.min(Number(match[2]), ref.size - 1) : ref.size - 1
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= ref.size
    )
      return response(null, 416, { ...headers, "Content-Range": `bytes */${ref.size}` })
    range = { offset: start, length: end - start + 1 }
  }
  if (request.method === "HEAD")
    return response(null, 200, { ...headers, "Content-Length": String(ref.size) })
  const object = await env.CONTENT.get(ref.key, range ? { range } : undefined)
  if (!object) throw new Error(`Published asset missing: ${filename}`)
  return response(object.body as unknown as ReadableStream, range ? 206 : 200, {
    ...headers,
    "Content-Length": String(range?.length ?? ref.size),
    ...(range
      ? { "Content-Range": `bytes ${range.offset}-${range.offset + range.length - 1}/${ref.size}` }
      : {}),
  })
}

async function handle(request: Request, env: Env, context: WorkerContext): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD")
    return response("Method not allowed", 405, { Allow: "GET, HEAD" })
  const url = new URL(request.url)
  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return response("Invalid URL", 400)
  }
  if (pathname.includes("\\") || pathname.includes("\0") || pathname.split("/").includes(".."))
    return response("Invalid URL", 400)
  if (pathname === "/healthz")
    return response(request.method === "HEAD" ? null : JSON.stringify({ rendererId }), 200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    })
  const session = env.DB.withSession("first-primary")
  const pinned = /^\/__releases\/([a-zA-Z0-9_-]{1,64})\/(.+)$/.exec(pathname)
  if (pathname.startsWith("/__releases/") && !pinned) return response("Not found", 404)
  const release = pinned
    ? await session
        .prepare("SELECT id, renderer_id, manifest_key FROM releases WHERE id = ? AND ready = 1")
        .bind(pinned[1])
        .first<ReleaseRow>()
    : await session
        .prepare(
          "SELECT r.id, r.renderer_id, r.manifest_key FROM site_state s JOIN releases r ON r.id = s.active_release WHERE s.id = 1 AND r.ready = 1",
        )
        .first<ReleaseRow>()
  if (!release)
    return response("No published content", pinned ? 404 : 503, { "Cache-Control": "no-store" })
  const site = await manifest(env, release)
  if (pinned)
    return (await serveAsset(request, env, site, pinned[2], true)) ?? response("Not found", 404)
  const filename = pathname.replace(/^\//, "")
  const asset = await serveAsset(request, env, site, filename, false)
  if (asset) return asset
  if (release.renderer_id !== rendererId)
    return response("Content renderer update pending", 503, {
      "Retry-After": "5",
      "Cache-Control": "no-store",
    })
  const slug = filename.replace(/\.html$/, "").replace(/\/$/, "") || "index"
  if (Object.hasOwn(site.redirects, slug))
    return response(null, 308, { Location: site.redirects[slug], "Cache-Control": "no-store" })
  const row = await session
    .prepare(
      "SELECT slug, artifact_key FROM pages WHERE release_id = ? AND slug IN (?, ?) ORDER BY CASE WHEN slug = ? THEN 0 ELSE 1 END LIMIT 1",
    )
    .bind(release.id, slug, `${slug}/index`, slug)
    .first<{ slug: string; artifact_key: string }>()
  const notFound = !row || row.slug === "404"
  const entry =
    row ?? (site.pages["404"] && { slug: "404", artifact_key: site.pages["404"].object.key })
  if (!entry) return response("Not found", 404)
  const cacheKey = new Request(
    `${url.origin}/__page-cache/${release.id}/${rendererId}/${encodeURIComponent(entry.slug)}/${notFound ? "404" : "200"}`,
  )
  const cache =
    typeof caches === "undefined"
      ? undefined
      : (caches as CacheStorage & { default: Cache }).default
  const cached = notFound ? undefined : await cache?.match(cacheKey)
  if (cached) {
    const result = new Response(request.method === "HEAD" ? null : cached.body, cached)
    result.headers.set("Cache-Control", "private, no-cache")
    return result
  }
  const object = await env.CONTENT.get(entry.artifact_key)
  if (!object) throw new Error("Published page artifact is missing")
  const page = await object.json<PageArtifact>()
  assertArtifactVersion(page)
  if (page.slug !== entry.slug) throw new Error("Page artifact slug mismatch")
  const html = renderArtifact(page, site)
  const result = response(request.method === "HEAD" ? null : html, notFound ? 404 : 200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-cache",
    "X-Content-Release": release.id,
  })
  if (!notFound && cache && request.method === "GET") {
    const stored = new Response(html, result)
    stored.headers.set("Cache-Control", "public, max-age=86400")
    context.waitUntil(cache.put(cacheKey, stored))
  }
  return result
}

export default {
  async fetch(request: Request, env: Env, context: WorkerContext): Promise<Response> {
    try {
      return await handle(request, env, context)
    } catch (error) {
      console.error("Blog request failed", error)
      return response(request.method === "HEAD" ? null : "Content temporarily unavailable", 503, {
        "Cache-Control": "no-store",
        "Retry-After": "5",
      })
    }
  },
}
