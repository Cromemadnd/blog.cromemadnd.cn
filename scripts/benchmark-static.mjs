// Benchmarks temporary vault copies; never publishes or changes the real notes.
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import { performance } from "node:perf_hooks"
import YAML from "yaml"
import { scanSource, captureSource, finalizeOutput } from "./static-publisher/files.mjs"

process.chdir(fileURLToPath(new URL("../", import.meta.url)))
const { loadCompiler } = await import("./static-publisher/runtime.mjs")
const args = process.argv.slice(2)
const option = (name, fallback) =>
  args
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? fallback
const count = Number(option("notes", "0"))
const edits = Number(option("edits", "3"))
if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(edits) || edits < 1)
  throw new Error("Invalid benchmark size")
const skipOgImages = args.includes("--skip-og")
const report = {
  node: process.version,
  cpu: os.cpus()[0]?.model,
  skipOgImages,
  notes: count,
  samples: [],
}
const root = await fs.mkdtemp(path.join(os.tmpdir(), "quartz-benchmark-"))
const source = path.join(root, "source")
const state = path.join(root, "state")
await fs.mkdir(state)
let runtime
try {
  if (count) {
    await fs.mkdir(source)
    for (let i = 0; i < count; i++) {
      await fs.writeFile(
        path.join(source, i ? `note-${i}.md` : "index.md"),
        `---\ntitle: Note ${i}\ntags: [benchmark]\n---\n\n# Note ${i}\n\n${"A paragraph with **formatting** and a [[note-1]] link.\n\n".repeat(8)}`,
      )
    }
  } else await fs.cp("content", source, { recursive: true, preserveTimestamps: true })
  const ignore =
    YAML.parse(await fs.readFile("quartz.config.yaml", "utf8")).configuration.ignorePatterns ?? []
  let start = performance.now()
  runtime = await loadCompiler(state, { skipOgImages })
  await runtime.compiler.ready()
  report.runtimeMs = performance.now() - start
  const initial = await scanSource(source, ignore)
  report.files = Object.keys(initial.files).length
  const editPath = path.join(source, count ? "index.md" : "about.md")
  const original = await fs.readFile(editPath, "utf8")
  const mtime = (await fs.stat(editPath)).mtimeMs
  let previousManifest
  async function build(label) {
    const stage = {}
    let start = performance.now()
    const scanned = await scanSource(source, ignore)
    stage.scan = performance.now() - start
    start = performance.now()
    const input = await captureSource(source, path.join(root, `input-${label}`), scanned)
    stage.capture = performance.now() - start
    start = performance.now()
    if ((await scanSource(source, ignore)).id !== scanned.id)
      throw new Error("Unstable benchmark source")
    stage.verify = performance.now() - start
    start = performance.now()
    const output = path.join(root, `output-${label}`)
    const result = await runtime.compiler.build(input, output, runtime.id)
    stage.compile = performance.now() - start
    start = performance.now()
    const manifest = await finalizeOutput(output)
    stage.inventory = performance.now() - start
    stage.total = Object.values(stage).reduce((a, b) => a + b, 0)
    const changedOutputPaths = previousManifest
      ? [
          ...new Set([...Object.keys(previousManifest.files), ...Object.keys(manifest.files)]),
        ].filter((name) => previousManifest.files[name]?.hash !== manifest.files[name]?.hash)
      : []
    previousManifest = manifest
    const sample = {
      label,
      stage,
      ...result,
      outputId: manifest.id,
      outputFiles: Object.keys(manifest.files).length,
      changedOutputPaths,
    }
    report.samples.push(sample)
    console.log(JSON.stringify(sample))
  }
  await build("cold")
  await build("warm")
  for (let i = 0; i < edits; i++) {
    await fs.writeFile(editPath, `${original}\nBenchmark append ${i}.\n`)
    // Same-day edits isolate content invalidation from changes to the date on OG cards.
    await fs.utimes(editPath, (mtime + 1000 * (i + 1)) / 1000, (mtime + 1000 * (i + 1)) / 1000)
    await build(`edit-${i + 1}`)
  }
  const filename = option("output", "")
  if (filename) await fs.writeFile(filename, JSON.stringify(report, null, 2))
} finally {
  runtime?.compiler.close()
  if (runtime) await fs.rm(runtime.runtimeDirectory, { recursive: true, force: true })
  if (args.includes("--keep")) console.log(JSON.stringify({ root }))
  else await fs.rm(root, { recursive: true, force: true })
}
