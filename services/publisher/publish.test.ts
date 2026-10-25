import assert from "node:assert/strict"
import { test } from "node:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { LocalTarget } from "./local-target"
import { ObjectStore } from "./objects"
import { publishRelease, rollback } from "./publish"
import { activeRelease, type PublishTarget } from "./target"
import type { Release } from "../../shared/artifact"

test("failed uploads keep the old release active; retries, CAS activation and rollback preserve snapshots", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quartz-publish-"))
  const target = new LocalTarget(path.join(root, "remote"))
  await target.migrate()
  const objects = new ObjectStore(path.join(root, "objects"))
  const create = async (id: string): Promise<Release> => {
    const object = await objects.json({ id })
    const site = {
      version: 1,
      releaseId: id,
      rendererId: "test",
      configuration: {},
      pages: {
        index: {
          slug: "index",
          title: id,
          layout: "content",
          unlisted: false,
          data: { frontmatter: { tags: ["test"] } },
          object,
        },
      },
      assets: {},
      redirects: {},
      emitterNames: [],
    } as unknown as Release["site"]
    return { id, rendererId: "test", site, manifest: await objects.json(site) }
  }
  try {
    const first = await create("first")
    await publishRelease(first, [], objects, target, null)
    const second = await create("second")
    const broken: PublishTarget = {
      query: target.query.bind(target),
      batch: target.batch.bind(target),
      putObject: async () => {
        throw new Error("network unavailable")
      },
    }
    await assert.rejects(
      () => publishRelease(second, [], objects, broken, "first"),
      /network unavailable/,
    )
    assert.equal(await activeRelease(target), "first")
    await assert.rejects(
      () => publishRelease(second, [], objects, target, null),
      /another publisher/,
    )
    await publishRelease(second, [], objects, target, "first")
    assert.equal(await activeRelease(target), "second")
    await rollback(target, "first")
    assert.equal(await activeRelease(target), "first")
    assert.equal((await publishRelease(first, [], objects, target, "second")).uploaded, 0)
    assert.equal(
      (await target.query({ sql: "SELECT * FROM pages WHERE release_id = 'second'" })).results
        .length,
      1,
    )
  } finally {
    target.db.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})
