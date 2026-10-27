import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { hash, inventory, readJson, writeJson } from "./files.mjs"

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options })
    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${path.basename(command)} failed (${signal ?? code})`))
    })
  })
}

export async function deploySnapshot(snapshot, config, dryRun = false) {
  const actual = await inventory(snapshot.directory)
  if (actual.id !== snapshot.id)
    throw new Error("Snapshot integrity check failed; rebuild before deploying")
  await run(
    process.execPath,
    [
      path.resolve("node_modules/wrangler/bin/wrangler.js"),
      "deploy",
      "--config",
      config,
      "--assets",
      snapshot.directory,
      ...(dryRun ? ["--dry-run"] : []),
    ],
    { env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
  )
}

// A single upload at a time; pending edits collapse to the newest complete snapshot.
export class DeploymentQueue {
  constructor({ state, config, retryMs = 10000, deploy = deploySnapshot, log = console.log }) {
    Object.assign(this, { state, config, retryMs, deploy, log })
    this.active = null
    this.timer = null
    this.closed = false
    this.desired = null
    this.last = null
  }

  async init() {
    this.configId = hash(await fs.readFile(this.config))
    this.last = await readJson(path.join(this.state, "deployed.json"), null)
    this.desired = await readJson(path.join(this.state, "desired.json"), null)
  }

  key(snapshot) {
    return `${this.configId}:${snapshot.id}`
  }

  async offer(snapshot) {
    // Caller awaits durable persistence before releasing/cleaning its output.
    await writeJson(path.join(this.state, "desired.json"), snapshot)
    this.desired = snapshot
    this.kick()
  }

  kick() {
    if (this.closed || this.active || this.timer || !this.desired) return
    if (this.last?.key === this.key(this.desired)) return
    this.active = this.drain().finally(() => {
      this.active = null
      if (!this.timer) this.kick()
    })
  }

  async drain() {
    const snapshot = this.desired
    try {
      const start = Date.now()
      await this.deploy(snapshot, this.config)
      const last = {
        key: this.key(snapshot),
        id: snapshot.id,
        directory: snapshot.directory,
        at: new Date().toISOString(),
      }
      await writeJson(path.join(this.state, "deployed.json"), last)
      this.last = last
      this.log(JSON.stringify({ event: "published", id: snapshot.id, ms: Date.now() - start }))
    } catch (error) {
      this.log(
        JSON.stringify({
          event: "publish-failed",
          id: snapshot.id,
          error: error.message,
          retryMs: this.retryMs,
        }),
      )
      if (!this.closed) {
        this.timer = setTimeout(() => {
          this.timer = null
          this.kick()
        }, this.retryMs)
      }
    }
  }

  async close() {
    this.closed = true
    clearTimeout(this.timer)
    this.timer = null
    await this.active
  }
}
