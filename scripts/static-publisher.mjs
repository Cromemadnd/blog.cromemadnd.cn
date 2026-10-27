import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { DatabaseSync } from "node:sqlite"
import chokidar from "chokidar"
import YAML from "yaml"
import { loadCompiler } from "./static-publisher/runtime.mjs"
import {
  assertSeparate,
  scanSource,
  captureSource,
  finalizeOutput,
  inventory,
  readJson,
  writeJson,
  pointSnapshot,
} from "./static-publisher/files.mjs"
import { DeploymentQueue, deploySnapshot } from "./static-publisher/queue.mjs"

const command = process.argv[2]
const flags = process.argv.slice(3)
if (
  !["build", "watch", "deploy"].includes(command) ||
  flags.some((flag) => !["--dry-run", "--no-deploy"].includes(flag)) ||
  (flags.includes("--dry-run") && command !== "deploy") ||
  (flags.includes("--no-deploy") && command !== "watch")
) {
  console.error("Usage: static-publisher.mjs build | watch [--no-deploy] | deploy [--dry-run]")
  process.exit(1)
}
const state = path.resolve(process.env.STATIC_STATE_DIR ?? ".static-publisher")
await fs.mkdir(state, { recursive: true })
const lock = new DatabaseSync(path.join(state, "lock.sqlite"))
try {
  lock.exec(
    "PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY); BEGIN EXCLUSIVE",
  )
} catch {
  lock.close()
  throw new Error("Another static publisher holds this state directory")
}
const config = path.resolve("apps/static/wrangler.jsonc")
const log = (value) => console.log(JSON.stringify(value))
const interval = (name, fallback) => {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < 100)
    throw new Error(`${name} must be an integer >= 100`)
  return value
}
let runtime
let queue
let watcher
let scanTimer
let timer
let task
let closing = false
let dirty = false
let loadedConfiguration
let lastBuiltSource
let resolveDone
const done = new Promise((resolve) => {
  resolveDone = resolve
})

async function shutdown() {
  if (closing) return
  closing = true
  clearTimeout(timer)
  clearInterval(scanTimer)
  await watcher?.close()
  await task
  await queue?.close()
  resolveDone()
}
process.once("SIGINT", () => {
  void shutdown()
})
process.once("SIGTERM", () => {
  void shutdown()
})

async function cleanupOutputs() {
  const desired = await readJson(path.join(state, "desired.json"), null)
  const deployed = await readJson(path.join(state, "deployed.json"), null)
  const latest = await readJson(path.join(state, "latest.json"), null)
  const keep = new Set([
    desired?.directory,
    deployed?.directory,
    latest?.directory,
    queue?.desired?.directory,
  ])
  // Keep every output during an upload; queue may be using an older snapshot.
  if (queue?.active) return
  const root = path.join(state, "outputs")
  await fs.mkdir(root, { recursive: true })
  for (const entry of await fs.readdir(root)) {
    const filename = path.join(root, entry)
    if (!keep.has(filename)) await fs.rm(filename, { recursive: true, force: true })
  }
}

async function build() {
  const ready = process.env.STATIC_READY_FILE
  if (ready) await fs.access(ready)
  const configuration = await fs.readFile("quartz.config.yaml", "utf8")
  if (configuration !== loadedConfiguration)
    throw new Error("Quartz configuration changed; restart the static publisher")
  const cfg = YAML.parse(configuration)
  const ignore = cfg.configuration.ignorePatterns ?? []
  const source = await fs.realpath(path.resolve(process.env.STATIC_SOURCE ?? "content"))
  assertSeparate(source, await fs.realpath(state))
  const start = performance.now()
  let stage = start
  const scanned = await scanSource(source, ignore)
  const ioMs = { scan: performance.now() - stage }
  if (lastBuiltSource === scanned.id) return
  const id = randomUUID()
  const inputDirectory = path.join(state, "inputs", id)
  const output = path.join(state, "outputs", id)
  await fs.mkdir(path.dirname(inputDirectory), { recursive: true })
  await fs.mkdir(path.dirname(output), { recursive: true })
  try {
    stage = performance.now()
    const input = await captureSource(source, inputDirectory, scanned)
    ioMs.capture = performance.now() - stage
    stage = performance.now()
    // Detect additions, deletions, renames, or edits made during the copy.
    if ((await scanSource(source, ignore)).id !== scanned.id)
      throw new Error("Source changed during snapshot; retrying")
    ioMs.verify = performance.now() - stage
    const stats = await runtime.compiler.build(input, output, runtime.id)
    stage = performance.now()
    const manifest = await finalizeOutput(output)
    ioMs.inventory = performance.now() - stage
    const snapshot = {
      directory: output,
      id: manifest.id,
      files: manifest.files,
      compilerId: runtime.id,
      at: new Date().toISOString(),
    }
    await writeJson(path.join(state, "latest.json"), snapshot)
    await pointSnapshot(state, output)
    log({
      event: "built",
      id: snapshot.id,
      source: scanned.id,
      ms: performance.now() - start,
      ioMs,
      ...stats,
    })
    if (queue) await queue.offer(snapshot)
    lastBuiltSource = scanned.id
    await cleanupOutputs()
    return snapshot
  } catch (error) {
    // An output referenced by latest.json is already complete; retain it for recovery.
    const latest = await readJson(path.join(state, "latest.json"), null)
    if (latest?.directory !== output) await fs.rm(output, { recursive: true, force: true })
    throw error
  } finally {
    await fs.rm(inputDirectory, { recursive: true, force: true })
  }
}

try {
  if (command === "deploy") {
    const snapshot = await readJson(path.join(state, "latest.json"), null)
    if (!snapshot) throw new Error("Run static:build before static:deploy")
    if (flags.includes("--dry-run")) await deploySnapshot(snapshot, config, true)
    else {
      const actual = await inventory(snapshot.directory)
      if (actual.id !== snapshot.id) throw new Error("Snapshot integrity check failed")
      await writeJson(path.join(state, "desired.json"), snapshot)
      await deploySnapshot(snapshot, config)
      const { hash } = await import("./static-publisher/files.mjs")
      await writeJson(path.join(state, "deployed.json"), {
        key: `${hash(await fs.readFile(config))}:${snapshot.id}`,
        ...snapshot,
      })
    }
  } else {
    loadedConfiguration = await fs.readFile("quartz.config.yaml", "utf8")
    runtime = await loadCompiler(state, {
      skipOgImages: process.env.STATIC_SKIP_OG_IMAGES === "true",
    })
    // Attribute one-time plugin initialization to startup, not the first source scan.
    await runtime.compiler.ready()
    if (command === "build") await build()
    else {
      if (!flags.includes("--no-deploy")) {
        queue = new DeploymentQueue({ state, config, retryMs: interval("STATIC_RETRY_MS", 10000) })
        await queue.init()
        // Do not deploy an old pending snapshot before checking the current source.
      }
      const retryMs = interval("STATIC_RETRY_MS", 10000)
      const debounceMs = interval("STATIC_DEBOUNCE_MS", 2000)
      const schedule = (delay = debounceMs) => {
        if (closing) return
        dirty = true
        clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          if (task) return // Its finally block will pick up dirty changes.
          dirty = false
          task = build()
            .catch((error) => {
              log({ event: "build-failed", error: error.message, retryMs })
              schedule(retryMs)
            })
            .finally(() => {
              task = null
              if (dirty && !timer) schedule()
            })
        }, delay)
      }
      const source = path.resolve(process.env.STATIC_SOURCE ?? "content")
      watcher = chokidar.watch(source, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
      })
      watcher.on("all", () => schedule())
      watcher.on("error", (error) => log({ event: "watch-error", error: error.message }))
      // Start only once the watcher is ready, avoiding a startup subscription gap.
      await new Promise((resolve) => watcher.once("ready", resolve))
      scanTimer = setInterval(() => schedule(100), interval("STATIC_SCAN_MS", 30000))
      schedule(100)
      log({ event: "watching", source, state, deploy: !!queue })
      await done
    }
  }
} finally {
  clearTimeout(timer)
  clearInterval(scanTimer)
  await watcher?.close()
  await queue?.close()
  runtime?.compiler.close()
  if (runtime) await fs.rm(runtime.runtimeDirectory, { recursive: true, force: true })
  lock.exec("ROLLBACK")
  lock.close()
}
