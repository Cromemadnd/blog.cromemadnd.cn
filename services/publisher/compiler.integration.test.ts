import assert from "node:assert/strict"
import { test } from "node:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"
import type { QuartzCompiler as CompilerType } from "./compiler"

test("Quartz compiler reuses clean parses, propagates embeds, removes deleted targets and rejects collisions", async () => {
  const module = await import(pathToFileURL(path.resolve(".cloud/compiler.mjs")).href)
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quartz-compiler-"))
  const source = path.join(root, "vault")
  await fs.mkdir(source)
  const note = (title: string, body: string) =>
    `---\ntitle: ${title}\ncreated: 2020-01-01\nmodified: 2020-01-01\n---\n${body}`
  await fs.writeFile(path.join(source, "a.md"), note("A", "![[b]]"))
  await fs.writeFile(path.join(source, "b.md"), note("B", "ORIGINAL"))
  await fs.writeFile(path.join(source, "c.md"), note("C", "unrelated"))
  const compiler: CompilerType = new module.QuartzCompiler({
    source,
    stateDirectory: path.join(root, "state"),
    rendererId: "test-renderer",
    skipOgImages: true,
  })
  try {
    const first = await compiler.build()
    compiler.markPublished(first)
    assert.equal(first.stats.parsed, 3)
    const same = await compiler.build()
    assert.equal(same.stats.parsed, 0)
    assert.equal(same.stats.transformed, 0)
    assert.equal(same.stats.bodies, 0)
    assert.equal(first.release.manifest.hash, same.release.manifest.hash)
    await fs.writeFile(path.join(source, "b.md"), note("B", "UPDATED EMBED"))
    const changed = await compiler.build()
    assert.equal(changed.stats.parsed, 1)
    assert.equal(changed.release.site.pages.c.object.hash, first.release.site.pages.c.object.hash)
    assert.notEqual(
      changed.release.site.pages.a.object.hash,
      first.release.site.pages.a.object.hash,
    )
    const parent = await compiler.objects.read(changed.release.site.pages.a.object)
    assert.match(parent.toString(), /UPDATED EMBED/)
    compiler.markPublished(changed)
    await fs.unlink(path.join(source, "b.md"))
    const removed = await compiler.build()
    assert.equal(removed.release.site.pages.b, undefined)
    assert.doesNotMatch(
      (await compiler.objects.read(removed.release.site.pages.a.object)).toString(),
      /UPDATED EMBED/,
    )
    await fs.writeFile(
      path.join(source, "c.md"),
      note("C", "unrelated").replace("title: C", "title: C\naliases: [new-alias]"),
    )
    const aliased = await compiler.build()
    assert.equal(aliased.stats.parsed, 1)
    assert.equal(aliased.stats.transformed, 2)
    assert.equal(aliased.release.site.redirects["new-alias"], "/c")
    const cachedAlias = await compiler.build()
    assert.equal(cachedAlias.stats.parsed, 0)
    assert.equal(cachedAlias.stats.transformed, 0)
    assert.equal(cachedAlias.release.manifest.hash, aliased.release.manifest.hash)
    await fs.writeFile(path.join(source, "incomplete.canvas"), "{")
    await assert.rejects(() => compiler.build(), /Cannot generate CanvasPage/)
    await fs.unlink(path.join(source, "incomplete.canvas"))
    await fs.writeFile(path.join(source, "a b.md"), note("Duplicate", "one"))
    await fs.writeFile(path.join(source, "a-b.md"), note("Duplicate", "two"))
    await assert.rejects(() => compiler.build(), /collision/i)
    assert.equal(compiler.state.get("publishedRelease"), changed.release.id)
  } finally {
    compiler.state.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("publisher refuses a release when an enabled plugin fails initialization", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quartz-plugin-failure-"))
  try {
    await fs.mkdir(path.join(root, "broken-plugin"))
    await fs.writeFile(
      path.join(root, "quartz.config.yaml"),
      "configuration: {}\nplugins:\n  - source: ./broken-plugin\n    enabled: true\n",
    )
    await fs.writeFile(
      path.join(root, "broken-plugin/package.json"),
      JSON.stringify({
        type: "module",
        main: "index.js",
        quartz: { name: "broken-plugin", category: "emitter" },
      }),
    )
    await fs.writeFile(
      path.join(root, "broken-plugin/index.js"),
      'throw new Error("intentional plugin initialization failure")',
    )
    const compilerUrl = pathToFileURL(path.resolve(".cloud/compiler.mjs")).href
    const script = `
      const { QuartzCompiler } = await import(${JSON.stringify(compilerUrl)});
      const compiler = new QuartzCompiler({ source: "vault", stateDirectory: "state", rendererId: "test", skipOgImages: true });
      try {
        await compiler.build();
        throw new Error("Unexpected successful build");
      } catch (error) {
        if (!error.message.includes("intentional plugin initialization failure")) throw error;
        console.log("rejected");
      } finally { compiler.state.close(); }
    `
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /rejected/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
