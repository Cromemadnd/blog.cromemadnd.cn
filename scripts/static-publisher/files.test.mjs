import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  assertSeparate,
  scanSource,
  captureSource,
  finalizeOutput,
  inventory,
  mapFiles,
} from "./files.mjs"
import { deploySnapshot } from "./queue.mjs"

test("source snapshot detects mutation, ignores private/hidden files, and copies binary attachments", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "static-files-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const source = path.join(root, "source")
  await fs.mkdir(path.join(source, "private"), { recursive: true })
  await fs.mkdir(path.join(source, ".obsidian"))
  await fs.writeFile(path.join(source, "index.md"), "hello")
  await fs.writeFile(path.join(source, "image.png"), Buffer.from([0, 1, 255]))
  await fs.writeFile(path.join(source, "private", "secret.md"), "secret")
  await fs.writeFile(path.join(source, ".obsidian", "config.json"), "secret")
  const input = await scanSource(source, ["private"])
  assert.deepEqual(Object.keys(input.files), ["image.png", "index.md"])
  const copied = await captureSource(source, path.join(root, "copy"), input)
  assert.deepEqual(
    await fs.readFile(path.join(copied.directory, "image.png")),
    Buffer.from([0, 1, 255]),
  )
  await fs.writeFile(path.join(source, "index.md"), "changed")
  await assert.rejects(captureSource(source, path.join(root, "bad-copy"), input), /Source changed/)
  assert.throws(() => assertSeparate(source, path.join(source, "state")), /separate/)
})

test("output validates size, control files, and content before upload", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "static-assets-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.writeFile(path.join(root, "index.html"), "hello")
  const valid = await finalizeOutput(root)
  assert.match(await fs.readFile(path.join(root, "_headers"), "utf8"), /max-age=0, must-revalidate/)
  await assert.rejects(finalizeOutput(root), /Reserved output name/)
  await fs.writeFile(path.join(root, "index.html"), "corrupt")
  await assert.rejects(deploySnapshot({ directory: root, id: valid.id }, "unused"), /integrity/)
  const large = await fs.open(path.join(root, "large.bin"), "w")
  await large.truncate(25 * 1024 * 1024 + 1)
  await large.close()
  await assert.rejects(inventory(root), /25 MiB/)
  await fs.rm(path.join(root, "large.bin"))
  await fs.symlink(path.join(root, "index.html"), path.join(root, "link"))
  await assert.rejects(inventory(root), /Symlink/)
})

test("parallel file operations preserve order, bound concurrency and drain failures before cleanup", async () => {
  let active = 0
  let maximum = 0
  const delay = () => new Promise((resolve) => setTimeout(resolve, 5))
  const values = Array.from({ length: 20 }, (_, i) => i)
  assert.deepEqual(
    await mapFiles(values, async (value) => {
      maximum = Math.max(maximum, ++active)
      await delay()
      active--
      return value * 2
    }),
    values.map((value) => value * 2),
  )
  assert.equal(maximum, 4)
  await assert.rejects(
    mapFiles(values, async (value) => {
      active++
      try {
        if (value === 0) throw new Error("copy failed")
        await delay()
      } finally {
        active--
      }
    }),
    /copy failed/,
  )
  assert.equal(active, 0, "No writes may outlive failure cleanup")
})
