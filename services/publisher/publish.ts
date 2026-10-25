import type { Release } from "../../shared/artifact"
import { ObjectStore } from "./objects"
import type { Dependency } from "./plan"
import { activeRelease, type PublishTarget, type SqlStatement } from "./target"
import { hash } from "./hash"

export async function publishRelease(
  release: Release,
  dependencies: Dependency[],
  objects: ObjectStore,
  target: PublishTarget,
  expectedActive: string | null,
): Promise<{ uploaded: number; reused: number }> {
  const current = await activeRelease(target)
  if (current === release.id) return { uploaded: 0, reused: 0 }
  if (current !== expectedActive)
    throw new Error("Active release changed; refusing to overwrite another publisher")
  const refs = new Map(
    [
      release.manifest,
      ...Object.values(release.site.assets),
      ...Object.values(release.site.pages).map((page) => page.object),
    ].map((ref) => [ref.key, ref]),
  )
  let uploaded = 0
  let reused = 0
  for (const ref of refs.values()) {
    const bytes = await objects.read(ref)
    if (bytes.length !== ref.size || hash(bytes) !== ref.hash)
      throw new Error(`Local object integrity check failed: ${ref.key}`)
    if (await target.putObject(ref, bytes)) uploaded++
    else reused++
  }
  const existing = await target.query<{ manifest_key: string }>({
    sql: "SELECT manifest_key FROM releases WHERE id = ?",
    params: [release.id],
  })
  if (existing.results[0] && existing.results[0].manifest_key !== release.manifest.key) {
    throw new Error("Release ID collision: the same inputs produced different manifests")
  }
  await target.query({
    sql: "INSERT OR IGNORE INTO releases (id, renderer_id, manifest_key) VALUES (?, ?, ?)",
    params: [release.id, release.rendererId, release.manifest.key],
  })
  // Each page is staged transactionally. None is visible until the pointer is activated.
  for (const page of Object.values(release.site.pages)) {
    const statements: SqlStatement[] = [
      {
        sql: "DELETE FROM tags WHERE release_id = ? AND slug = ?",
        params: [release.id, page.slug],
      },
      {
        sql: "INSERT OR REPLACE INTO pages VALUES (?, ?, ?, ?, ?, ?, ?)",
        params: [
          release.id,
          page.slug,
          page.title,
          page.layout,
          Number(page.unlisted),
          page.object.key,
          JSON.stringify(page.data),
        ],
      },
    ]
    const fm = page.data.frontmatter as { tags?: string[] } | undefined
    for (const tag of new Set(fm?.tags ?? []))
      statements.push({
        sql: "INSERT INTO tags VALUES (?, ?, ?)",
        params: [release.id, page.slug, tag],
      })
    await target.batch(statements)
  }
  await target.query({ sql: "DELETE FROM links WHERE release_id = ?", params: [release.id] })
  const edges = [
    ...new Map(
      dependencies.map((edge) => [`${edge.source}\0${edge.target}\0${edge.type}`, edge]),
    ).values(),
  ]
  for (let i = 0; i < edges.length; i += 40) {
    await target.batch(
      edges.slice(i, i + 40).map((edge) => ({
        sql: "INSERT OR IGNORE INTO links VALUES (?, ?, ?, ?)",
        params: [release.id, edge.source, edge.target, edge.type],
      })),
    )
  }
  await target.batch([
    { sql: "UPDATE releases SET ready = 1 WHERE id = ?", params: [release.id] },
    {
      sql: "UPDATE site_state SET active_release = ? WHERE id = 1 AND active_release IS ?",
      params: [release.id, expectedActive],
    },
  ])
  if ((await activeRelease(target)) !== release.id)
    throw new Error("Activation lost a concurrent publish; staged release was not made active")
  return { uploaded, reused }
}

export async function rollback(target: PublishTarget, releaseId: string): Promise<void> {
  const current = await activeRelease(target)
  const release = await target.query({
    sql: "SELECT id FROM releases WHERE id = ? AND ready = 1",
    params: [releaseId],
  })
  if (!release.results.length) throw new Error(`No completed release: ${releaseId}`)
  await target.query({
    sql: "UPDATE site_state SET active_release = ? WHERE id = 1 AND active_release IS ?",
    params: [releaseId, current],
  })
  if ((await activeRelease(target)) !== releaseId)
    throw new Error("Concurrent release change; rollback did not activate")
}
