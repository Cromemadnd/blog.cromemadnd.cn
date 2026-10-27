import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { loadCompiler } from "./runtime.mjs"
import { scanSource, captureSource, finalizeOutput } from "./files.mjs"

// Uses the real enabled Quartz plugins, layouts and static emitters; no Cloudflare writes.
test(
  "Quartz snapshots reuse parses and keep embeds, aliases, privacy and deletion consistent",
  { timeout: 120000 },
  async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "static-compiler-"))
    const source = path.join(root, "source")
    const state = path.join(root, "state")
    await fs.mkdir(source)
    await fs.mkdir(state)
    let runtime = await loadCompiler(state, { skipOgImages: true })
    t.after(async () => {
      runtime.compiler.close()
      await fs.rm(runtime.runtimeDirectory, { recursive: true, force: true })
      await fs.rm(root, { recursive: true, force: true })
    })
    let generation = 0
    async function build() {
      const n = generation++
      const input = await captureSource(
        source,
        path.join(root, `input-${n}`),
        await scanSource(source, []),
      )
      const output = path.join(root, `output-${n}`)
      const stats = await runtime.compiler.build(input, output, runtime.id)
      const manifest = await finalizeOutput(output)
      return { stats, output, manifest }
    }
    const read = (result, filename) => fs.readFile(path.join(result.output, filename), "utf8")
    const note = (body, extra = "", aliases = "old-alias") =>
      `---\ntitle: Note\naliases: [${aliases}]\ntags: [testing]\n${extra}---\n\n${body}\n`
    await fs.writeFile(path.join(source, "index.md"), "---\ntitle: Home\n---\n\n![[note]]\n")
    await fs.writeFile(path.join(source, "note.md"), note("ORIGINAL_EMBED"))
    await fs.writeFile(path.join(source, "image.png"), Buffer.from([0, 1, 255]))
    const first = await build()
    assert.equal(first.stats.parsed, 2)
    assert.match(await read(first, "index.html"), /ORIGINAL_EMBED/)
    assert.ok(first.manifest.files["old-alias.html"])
    assert.ok(first.manifest.files["image.png"])
    const warm = await build()
    assert.equal(warm.stats.parsed, 0)
    assert.equal(warm.stats.transformed, 0)
    assert.equal(warm.manifest.id, first.manifest.id)

    await fs.writeFile(path.join(source, "note.md"), note("UPDATED_EMBED"))
    const edited = await build()
    assert.equal(edited.stats.parsed, 1)
    assert.equal(edited.stats.transformed, 1)
    assert.match(await read(edited, "index.html"), /UPDATED_EMBED/)
    assert.doesNotMatch(await read(edited, "index.html"), /ORIGINAL_EMBED/)

    await fs.writeFile(path.join(source, "note.md"), note("UPDATED_EMBED", "", "new-alias"))
    const alias = await build()
    assert.ok(alias.manifest.files["new-alias.html"])
    assert.equal(alias.manifest.files["old-alias.html"], undefined)

    await fs.writeFile(
      path.join(source, "note.md"),
      note("UPDATED_EMBED", "unlisted: true\n", "new-alias"),
    )
    const unlisted = await build()
    assert.ok(unlisted.manifest.files["note.html"])
    const index = JSON.parse(await read(unlisted, "static/contentIndex.json"))
    assert.equal(index.note, undefined)

    await fs.writeFile(
      path.join(source, "note.md"),
      note("DRAFT_SECRET", "draft: true\n", "new-alias"),
    )
    const draft = await build()
    assert.equal(draft.manifest.files["note.html"], undefined)
    assert.equal(draft.manifest.files["new-alias.html"], undefined)
    assert.doesNotMatch(await read(draft, "index.html"), /DRAFT_SECRET/)

    await fs.rename(path.join(source, "note.md"), path.join(source, "renamed.md"))
    await fs.writeFile(
      path.join(source, "renamed.md"),
      "---\ntitle: Renamed\n---\nRenamed content\n",
    )
    await fs.rm(path.join(source, "image.png"))
    const renamed = await build()
    assert.equal(renamed.manifest.files["note.html"], undefined)
    assert.equal(renamed.manifest.files["image.png"], undefined)
    assert.ok(renamed.manifest.files["renamed.html"])

    runtime.compiler.close()
    runtime = await loadCompiler(state, { skipOgImages: true })
    const restarted = await build()
    assert.equal(restarted.stats.parsed, 0)
    assert.equal(restarted.stats.transformed, 0)
    assert.equal(restarted.manifest.id, renamed.manifest.id)

    await fs.writeFile(
      path.join(source, "renamed.md"),
      "---\ntitle: Bad\nmodified: definitely-not-a-date\n---\nBroken\n",
    )
    await assert.rejects(build(), /Invalid date/)
    assert.match(await read(restarted, "renamed.html"), /Renamed content/)
    await fs.rm(path.join(source, "index.md"))
    await fs.rm(path.join(source, "renamed.md"))
    await assert.rejects(build(), /empty source/)
  },
)
