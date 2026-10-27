import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DeploymentQueue } from "./queue.mjs"
import { readJson } from "./files.mjs"

const tick = () => new Promise((resolve) => setImmediate(resolve))
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await tick()
  }
  throw new Error("Timed out waiting for queue")
}
async function setup(t, deploy, retryMs = 100000) {
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "static-queue-"))
  const config = path.join(state, "wrangler.jsonc")
  await fs.writeFile(config, '{"name":"test"}')
  const queue = new DeploymentQueue({ state, config, deploy, retryMs, log: () => {} })
  await queue.init()
  t.after(async () => {
    await queue.close()
    await fs.rm(state, { recursive: true, force: true })
  })
  return { queue, state, config }
}

test("uploads serialize, collapse intermediate versions, and skip identical output", async (t) => {
  const calls = []
  const gates = []
  let concurrent = 0
  const { queue, state } = await setup(t, async (snapshot) => {
    assert.equal(++concurrent, 1)
    calls.push(snapshot.id)
    await new Promise((resolve) => gates.push(resolve))
    concurrent--
  })
  await queue.offer({ id: "a", directory: "/a" })
  await until(() => calls.length === 1)
  await queue.offer({ id: "b", directory: "/b" })
  await queue.offer({ id: "c", directory: "/c" })
  gates.shift()()
  await until(() => calls.length === 2)
  assert.deepEqual(calls, ["a", "c"])
  gates.shift()()
  await until(() => !queue.active)
  await queue.offer({ id: "c", directory: "/other-c" })
  assert.deepEqual(calls, ["a", "c"])
  assert.equal((await readJson(path.join(state, "deployed.json"))).id, "c")
})

test("failed upload keeps last success; restart recovers durable newest snapshot", async (t) => {
  const { queue, state, config } = await setup(t, async () => {
    throw new Error("network down")
  })
  await queue.offer({ id: "a", directory: "/a" })
  await until(() => !queue.active)
  assert.equal(await readJson(path.join(state, "deployed.json"), null), null)
  await queue.offer({ id: "b", directory: "/b" })
  await queue.close()
  const calls = []
  const recovered = new DeploymentQueue({
    state,
    config,
    deploy: async (s) => calls.push(s.id),
    log: () => {},
  })
  await recovered.init()
  recovered.kick()
  await until(() => !recovered.active)
  await recovered.close()
  assert.deepEqual(calls, ["b"])
  assert.equal((await readJson(path.join(state, "deployed.json"))).id, "b")
})

test("retry uses the newest snapshot without requiring another build", async (t) => {
  let fail = true
  const calls = []
  const { queue } = await setup(
    t,
    async (snapshot) => {
      calls.push(snapshot.id)
      if (fail) throw new Error("temporary failure")
    },
    10,
  )
  await queue.offer({ id: "a", directory: "/a" })
  await until(() => !queue.active)
  fail = false
  await queue.offer({ id: "b", directory: "/b" })
  await new Promise((resolve) => setTimeout(resolve, 50))
  await until(() => !queue.active)
  assert.deepEqual(calls, ["a", "b"])
  assert.equal(queue.last.id, "b")
})
