import fs from "node:fs/promises"
import path from "node:path"
import chokidar from "chokidar"
import { QuartzCompiler } from "./compiler"
import { LocalTarget } from "./local-target"
import { CloudflareTarget } from "./cloudflare-target"
import { activeRelease, type PublishTarget } from "./target"
import { publishRelease, rollback } from "./publish"
import { BindingTarget } from "./binding-target"
import { PublisherLock } from "./lock"
import type { D1Database, R2Bucket } from "@cloudflare/workers-types"

declare const __QUARTZ_RENDERER_ID__: string

const command = process.argv[2] ?? "build"
const argumentsAfterCommand = process.argv.slice(3).filter((argument) => argument !== "--")
const source = path.resolve(process.env.PUBLISH_SOURCE ?? "content")
const stateDirectory = path.resolve(process.env.PUBLISH_STATE_DIR ?? ".publisher")
const localDirectory = path.resolve(
  process.env.PUBLISH_LOCAL_DIR ?? path.join(stateDirectory, "cloudflare"),
)
const isCloud = process.env.PUBLISH_TARGET === "cloudflare"
if (!["local", "wrangler", "cloudflare"].includes(process.env.PUBLISH_TARGET ?? "local")) {
  throw new Error("PUBLISH_TARGET must be local, wrangler or cloudflare")
}
const truth = (name: string) => process.env[name] === "true"
const compiler = new QuartzCompiler({
  source,
  stateDirectory,
  rendererId: __QUARTZ_RENDERER_ID__,
  allowEmpty: truth("PUBLISH_ALLOW_EMPTY"),
  requirePublishFlag: truth("PUBLISH_REQUIRE_FLAG"),
  skipOgImages: truth("PUBLISH_SKIP_OG_IMAGES"),
})

let target: PublishTarget
let local: LocalTarget | undefined
let disposeProxy: (() => Promise<void>) | undefined
if (isCloud && command !== "build") {
  const required = (key: string) => {
    const value = process.env[key]
    if (!value) throw new Error(`Missing environment variable: ${key}`)
    return value
  }
  target = new CloudflareTarget({
    accountId: required("CLOUDFLARE_ACCOUNT_ID"),
    databaseId: required("CLOUDFLARE_D1_DATABASE_ID"),
    apiToken: required("CLOUDFLARE_API_TOKEN"),
    bucket: required("R2_BUCKET"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  })
} else if (process.env.PUBLISH_TARGET === "wrangler" && command !== "build") {
  const { getPlatformProxy } = await import("wrangler")
  const proxy = await getPlatformProxy<{ DB: D1Database; CONTENT: R2Bucket }>({
    configPath: "apps/worker/wrangler.jsonc",
    // The Wrangler CLI appends v3 to --persist-to; getPlatformProxy uses the exact path.
    persist: { path: path.join(stateDirectory, "wrangler", "v3") },
  })
  disposeProxy = proxy.dispose
  target = new BindingTarget(proxy.env.DB, proxy.env.CONTENT)
  const migration = await fs.readFile("apps/worker/migrations/0001_releases.sql", "utf8")
  for (const sql of migration
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean))
    await target.query({ sql })
} else {
  local = new LocalTarget(localDirectory)
  await local.migrate()
  target = local
}

async function run(publish: boolean): Promise<void> {
  if (process.env.PUBLISH_READY_FILE) await fs.access(process.env.PUBLISH_READY_FILE)
  // Capture before compilation: another publisher cannot slip in while this build runs.
  const expected = publish ? await activeRelease(target) : null
  const batch = compiler.state.pending()
  const result = await compiler.build()
  console.log(JSON.stringify({ event: "built", release: result.release.id, ...result.stats }))
  if (!publish) return
  const counts = await publishRelease(
    result.release,
    result.dependencies,
    compiler.objects,
    target,
    expected,
  )
  compiler.markPublished(result)
  compiler.state.acknowledge(batch)
  console.log(
    JSON.stringify({
      event: "published",
      target: process.env.PUBLISH_TARGET ?? "local",
      release: result.release.id,
      ...counts,
    }),
  )
}

let processLock: PublisherLock | undefined
function lock(): void {
  processLock = new PublisherLock(path.join(stateDirectory, "publisher-lock.sqlite"))
}

try {
  if (command === "status") {
    console.log(
      JSON.stringify(
        {
          target: isCloud ? "cloudflare" : "local",
          activeRelease: await activeRelease(target),
          pending: compiler.state.pending(),
        },
        null,
        2,
      ),
    )
  } else if (command === "rollback") {
    if (!argumentsAfterCommand[0]) throw new Error("Usage: publisher rollback <release-id>")
    lock()
    await rollback(target, argumentsAfterCommand[0])
    console.log(`Activated ${argumentsAfterCommand[0]}`)
  } else if (command === "build" || command === "publish") {
    lock()
    await run(command === "publish")
  } else if (command === "watch") {
    lock()
    const debounceMs = Number(process.env.PUBLISH_DEBOUNCE_MS ?? 2000)
    const reconcileMs = Number(process.env.PUBLISH_RECONCILE_MS ?? 30_000)
    if (
      !Number.isFinite(debounceMs) ||
      debounceMs < 100 ||
      !Number.isFinite(reconcileMs) ||
      reconcileMs < 1000
    )
      throw new Error("Invalid publisher timing settings")
    let running = false
    let scheduled = false
    let stopping = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let finish: (() => void) | undefined
    const stopped = new Promise<void>((resolve) => {
      finish = resolve
    })
    const schedule = (delay = debounceMs) => {
      if (stopping) return
      scheduled = true
      clearTimeout(timer)
      timer = setTimeout(drain, delay)
    }
    const drain = async () => {
      if (running || stopping) return
      running = true
      scheduled = false
      let nextDelay = debounceMs
      try {
        await run(true)
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "publish-failed",
            message: error instanceof Error ? error.message : String(error),
          }),
        )
        scheduled = true
        nextDelay = Math.max(5000, debounceMs)
      } finally {
        running = false
        if (stopping) finish?.()
        else if (scheduled || compiler.state.pending().length) schedule(nextDelay)
      }
    }
    const watcher = chokidar.watch(source, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    })
    watcher.on("all", (event, filename) => {
      if (!["add", "change", "unlink"].includes(event)) return
      compiler.state.dirty(path.relative(source, filename).split(path.sep).join("/"))
      schedule()
    })
    watcher.on("error", (error) => console.error("Source watcher:", error))
    // Snapshot comparison makes this reconciliation useful even when an event was missed.
    const reconcile = setInterval(() => schedule(), reconcileMs)
    const stop = async () => {
      stopping = true
      clearTimeout(timer)
      clearInterval(reconcile)
      await watcher.close()
      if (!running) finish?.()
    }
    process.once("SIGINT", () => {
      void stop()
    })
    process.once("SIGTERM", () => {
      void stop()
    })
    schedule(0)
    await stopped
  } else throw new Error(`Unknown publisher command: ${command}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  compiler.state.close()
  local?.db.close()
  await disposeProxy?.()
  processLock?.close()
}
