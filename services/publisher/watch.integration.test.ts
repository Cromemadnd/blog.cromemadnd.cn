import assert from "node:assert/strict"
import { test } from "node:test"
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

test(
  "watch publishes edits, survives a killed process and resumes persisted state",
  { timeout: 30_000 },
  async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "quartz-watch-"))
    const source = path.join(root, "vault")
    const state = path.join(root, "state")
    await fs.mkdir(source)
    const note = (text: string) =>
      `---\ntitle: Home\ncreated: 2020-01-01\nmodified: 2020-01-01\n---\n${text}`
    await fs.writeFile(path.join(source, "index.md"), note("FIRST"))
    let output = ""
    const start = () => {
      const child = spawn(process.execPath, [".cloud/publisher.mjs", "watch"], {
        env: {
          ...process.env,
          PUBLISH_TARGET: "local",
          PUBLISH_SOURCE: source,
          PUBLISH_STATE_DIR: state,
          PUBLISH_SKIP_OG_IMAGES: "true",
          PUBLISH_DEBOUNCE_MS: "150",
          PUBLISH_RECONCILE_MS: "1000",
        },
        stdio: ["ignore", "pipe", "pipe"],
      })
      child.stdout.on("data", (bytes) => {
        output += bytes.toString()
      })
      child.stderr.on("data", (bytes) => {
        output += bytes.toString()
      })
      return child
    }
    const waitFor = async (condition: () => boolean) => {
      const deadline = Date.now() + 15_000
      while (!condition()) {
        if (Date.now() > deadline) throw new Error(`Publisher did not converge: ${output}`)
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
    let child = start()
    const stop = async (signal: NodeJS.Signals) => {
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()))
      child.kill(signal)
      await exited
    }
    const published = () =>
      output
        .split("\n")
        .filter((line) => line.includes('"event":"published"'))
        .map((line) => JSON.parse(line).release as string)
    try {
      await waitFor(() => published().length > 0)
      const first = published()[0]
      await fs.writeFile(path.join(source, "index.md"), note("SECOND"))
      await waitFor(() => published().some((release) => release !== first))
      await stop("SIGKILL")
      await fs.writeFile(path.join(source, "index.md"), note("AFTER RESTART"))
      output = ""
      child = start()
      await waitFor(() => published().length > 0)
      const db = new DatabaseSync(path.join(state, "cloudflare/d1.sqlite"), { readOnly: true })
      try {
        const row = db
          .prepare(
            "SELECT p.artifact_key FROM pages p JOIN site_state s ON s.active_release = p.release_id WHERE p.slug = 'index'",
          )
          .get()!
        assert.match(
          await fs.readFile(path.join(state, "cloudflare/r2", row.artifact_key as string), "utf8"),
          /AFTER RESTART/,
        )
      } finally {
        db.close()
      }
      await stop("SIGTERM")
      assert.doesNotMatch(output, /holds the state directory lock/)
    } finally {
      if (child.exitCode === null && child.signalCode === null) await stop("SIGKILL")
      await fs.rm(root, { recursive: true, force: true })
    }
  },
)
