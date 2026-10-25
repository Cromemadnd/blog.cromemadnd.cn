import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { BuildState } from "./state"
import { affectedPages } from "./plan"
import { PublisherLock } from "./lock"

test("acknowledging an old build preserves edits received during that build and across restart", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "quartz-publisher-"))
  const filename = path.join(dir, "state.sqlite")
  let state = new BuildState(filename)
  try {
    state.dirty("a.md")
    const batch = state.pending()
    state.dirty("a.md")
    state.acknowledge(batch)
    state.close()
    state = new BuildState(filename)
    assert.equal(state.pending()[0].generation, 2)
    state.acknowledge(state.pending())
    assert.deepEqual(state.pending(), [])
  } finally {
    state.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test("removed embed edges invalidate transitive parents without looping on cycles", () => {
  const result = affectedPages(
    ["b"],
    [
      { source: "a", target: "b", type: "embed" },
      { source: "c", target: "a", type: "embed" },
      { source: "b", target: "c", type: "embed" },
      { source: "d", target: "b", type: "link" },
    ],
    [],
  )
  assert.deepEqual([...result].sort(), ["a", "b", "c"])
})

test("publisher lock excludes a second process connection and releases without stale files", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "quartz-lock-"))
  const filename = path.join(dir, "lock.sqlite")
  const first = new PublisherLock(filename)
  try {
    assert.throws(() => new PublisherLock(filename), /Another publisher/)
  } finally {
    first.close()
  }
  const second = new PublisherLock(filename)
  second.close()
  rmSync(dir, { recursive: true, force: true })
})
