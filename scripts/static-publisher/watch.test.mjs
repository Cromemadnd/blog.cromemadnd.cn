import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { readJson } from "./files.mjs"

test(
  "watch gates initial sync, retries failed builds, publishes stable local snapshots and releases its lock",
  { timeout: 60000 },
  async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "static-watch-"))
    const source = path.join(root, "source")
    const state = path.join(root, "state")
    const ready = path.join(root, "ready")
    await fs.mkdir(source)
    await fs.writeFile(path.join(source, "index.md"), "---\ntitle: Home\n---\nWATCH_ORIGINAL\n")
    await fs.writeFile(path.join(source, "other.md"), "---\ntitle: Other\n---\nOther\n")
    const events = []
    let output = ""
    const env = {
      ...process.env,
      STATIC_SOURCE: source,
      STATIC_STATE_DIR: state,
      STATIC_READY_FILE: ready,
      STATIC_SKIP_OG_IMAGES: "true",
      STATIC_DEBOUNCE_MS: "100",
      STATIC_RETRY_MS: "200",
      STATIC_SCAN_MS: "300",
    }
    const child = spawn(
      process.execPath,
      ["scripts/static-publisher.mjs", "watch", "--no-deploy"],
      { env },
    )
    let pending = ""
    child.stdout.on("data", (chunk) => {
      output += chunk
      pending += chunk
      const lines = pending.split("\n")
      pending = lines.pop()
      for (const line of lines) {
        try {
          const event = JSON.parse(line)
          if (event.event) events.push(event)
        } catch {
          /* Plugin log. */
        }
      }
    })
    child.stderr.on("data", (chunk) => {
      output += chunk
    })
    const exited = new Promise((resolve) =>
      child.once("exit", (code, signal) => resolve({ code, signal })),
    )
    let stopped = false
    t.after(async () => {
      if (!stopped) {
        child.kill("SIGKILL")
        await exited
      }
      await fs.rm(root, { recursive: true, force: true })
    })
    async function waitFor(predicate) {
      const deadline = Date.now() + 20000
      while (Date.now() < deadline) {
        if (predicate()) return
        if (child.exitCode !== null) throw new Error(output)
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      throw new Error(`Watcher timeout: ${output}`)
    }
    await waitFor(() => events.some((e) => e.event === "build-failed"))
    assert.equal(await readJson(path.join(state, "latest.json"), null), null)
    await fs.writeFile(ready, "")
    await waitFor(() => events.filter((e) => e.event === "built").length === 1)
    const first = await readJson(path.join(state, "latest.json"))

    // A second process must not rebuild or deploy from the same state directory.
    const contender = spawn(process.execPath, ["scripts/static-publisher.mjs", "build"], { env })
    let error = ""
    contender.stderr.on("data", (chunk) => {
      error += chunk
    })
    await new Promise((resolve) => contender.once("exit", resolve))
    assert.match(error, /Another static publisher/)

    await fs.writeFile(
      path.join(source, "index.md"),
      "---\ntitle: Home\nmodified: invalid-date\n---\nBROKEN\n",
    )
    const failedBefore = events.filter((e) => e.event === "build-failed").length
    await waitFor(() => events.filter((e) => e.event === "build-failed").length > failedBefore)
    assert.equal((await readJson(path.join(state, "latest.json"))).id, first.id)
    await fs.writeFile(path.join(source, "index.md"), "---\ntitle: Home\n---\nWATCH_UPDATED\n")
    await waitFor(() => events.filter((e) => e.event === "built").length === 2)
    const lastBuild = events.filter((e) => e.event === "built").at(-1)
    assert.equal(lastBuild.parsed, 1)
    assert.equal(lastBuild.reused, 1)
    assert.match(
      await fs.readFile(path.join(state, "snapshot", "index.html"), "utf8"),
      /WATCH_UPDATED/,
    )
    const count = events.filter((e) => e.event === "built").length
    await new Promise((resolve) => setTimeout(resolve, 700))
    assert.equal(events.filter((e) => e.event === "built").length, count)
    child.kill("SIGTERM")
    assert.deepEqual(await exited, { code: 0, signal: null })
    stopped = true

    // A normal process after shutdown can acquire the OS-backed lock and reuse parses.
    const restarted = spawn(process.execPath, ["scripts/static-publisher.mjs", "build"], { env })
    let restartOutput = ""
    restarted.stdout.on("data", (chunk) => {
      restartOutput += chunk
    })
    restarted.stderr.on("data", (chunk) => {
      restartOutput += chunk
    })
    assert.equal(await new Promise((resolve) => restarted.once("exit", resolve)), 0, restartOutput)
    const restartedBuild = restartOutput
      .split("\n")
      .flatMap((line) => {
        try {
          return [JSON.parse(line)]
        } catch {
          return []
        }
      })
      .find((e) => e.event === "built")
    assert.equal(restartedBuild.parsed, 0)
  },
)
