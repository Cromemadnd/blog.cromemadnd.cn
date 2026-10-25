import assert from "node:assert/strict"
import { test } from "node:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { QuartzCompiler as CompilerType } from "../../../services/publisher/compiler"
import { LocalTarget } from "../../../services/publisher/local-target"
import { publishRelease } from "../../../services/publisher/publish"
import type { Env, WorkerContext } from "../src/index"

test("Worker renders published Quartz pages, pins resources and switches releases without stale HTML", async () => {
  const { QuartzCompiler } = await import(pathToFileURL(path.resolve(".cloud/compiler.mjs")).href)
  const { default: worker } = await import(pathToFileURL(path.resolve(".cloud/worker.mjs")).href)
  const { rendererId } = JSON.parse(await fs.readFile(".cloud/build-info.json", "utf8"))
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "quartz-worker-"))
  const source = path.join(root, "vault")
  await fs.mkdir(source)
  const note = (title: string, text: string, extra = "") =>
    `---\ntitle: ${title}\ncreated: 2020-01-01\nmodified: 2020-01-01\n${extra}---\n${text}`
  await fs.writeFile(
    path.join(source, "index.md"),
    note("Home", "# Home\n![[b]]\n![photo](./photo.svg)"),
  )
  await fs.writeFile(
    path.join(source, "b.md"),
    note("B", 'ORIGINAL BODY\n<span style="color:red">styled text</span>'),
  )
  await fs.writeFile(
    path.join(source, "hidden.md"),
    note("Hidden", "UNLISTED BODY", "unlisted: true\n"),
  )
  await fs.writeFile(path.join(source, "draft.md"), note("Draft", "DRAFT BODY", "draft: true\n"))
  await fs.writeFile(path.join(source, "photo.svg"), "<svg>original</svg>")
  const compiler: CompilerType = new QuartzCompiler({
    source,
    stateDirectory: path.join(root, "state"),
    rendererId,
    skipOgImages: true,
  })
  const target = new LocalTarget(path.join(root, "remote"))
  await target.migrate()
  const env = {
    DB: {
      withSession() {
        return this
      },
      prepare(sql: string) {
        let params: (string | number | null)[] = []
        return {
          bind(...args: (string | number | null)[]) {
            params = args
            return this
          },
          async first() {
            return target.db.prepare(sql).get(...params) ?? null
          },
        }
      },
    },
    CONTENT: {
      async get(key: string, options?: { range?: { offset: number; length: number } }) {
        let bytes: Buffer
        try {
          bytes = await fs.readFile(path.join(target.directory, "r2", key))
        } catch {
          return null
        }
        if (options?.range)
          bytes = bytes.subarray(options.range.offset, options.range.offset + options.range.length)
        const response = new Response(new Uint8Array(bytes).buffer)
        return {
          body: response.body,
          async json() {
            return JSON.parse(bytes.toString())
          },
        }
      },
    },
  } as unknown as Env
  const pending: Promise<unknown>[] = []
  const context: WorkerContext = {
    waitUntil(promise) {
      pending.push(promise)
    },
  }
  const previousCaches = Object.getOwnPropertyDescriptor(globalThis, "caches")
  const cached = new Map<string, Response>()
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      default: {
        async match(request: Request) {
          return cached.get(request.url)?.clone()
        },
        async put(request: Request, response: Response) {
          cached.set(request.url, response.clone())
        },
      },
    },
  })
  const fetchPage = async (pathname: string, init?: RequestInit): Promise<Response> => {
    const result = await worker.fetch(
      new Request(`https://blog.cromemadnd.cn${pathname}`, init),
      env,
      context,
    )
    await Promise.all(pending.splice(0))
    return result
  }
  try {
    const first = await compiler.build()
    await publishRelease(first.release, first.dependencies, compiler.objects, target, null)
    compiler.markPublished(first)
    const home = await fetchPage("/")
    assert.equal(home.status, 200)
    const html = await home.text()
    assert.match(html, /<title>Home<\/title>/)
    assert.match(html, /ORIGINAL BODY/)
    assert.match(html, /class="page-header"/)
    assert.match(html, new RegExp(`/__releases/${first.release.id}/index-`))
    assert.match(html, new RegExp(`/__releases/${first.release.id}/photo.svg`))
    assert.equal((await fetchPage("/", { method: "HEAD" })).status, 200)
    assert.equal(await (await fetchPage("/", { method: "HEAD" })).text(), "")
    assert.equal((await fetchPage("/b.html")).status, 200)
    assert.equal((await fetchPage("/does-not-exist")).status, 404)
    assert.equal((await fetchPage("/", { method: "POST" })).status, 405)
    assert.equal((await fetchPage("/%E0%A4%A")).status, 400)
    assert.equal((await fetchPage("/hidden")).status, 200)
    assert.equal((await fetchPage("/draft")).status, 404)
    const index = (await (await fetchPage("/static/contentIndex.json")).json()) as Record<
      string,
      unknown
    >
    assert.equal(index.hidden, undefined)
    assert.equal(index.draft, undefined)
    const range = await fetchPage("/photo.svg", { headers: { Range: "bytes=0-3" } })
    assert.equal(range.status, 206)
    assert.equal(await range.text(), "<svg")
    const pinned = `/__releases/${first.release.id}/photo.svg`
    const originalAsset = await fetchPage(pinned)
    assert.match(originalAsset.headers.get("Cache-Control")!, /immutable/)
    assert.equal(
      (
        await fetchPage(pinned, {
          headers: { "If-None-Match": originalAsset.headers.get("ETag")! },
        })
      ).status,
      304,
    )
    await fs.writeFile(path.join(source, "b.md"), note("B", "NEW BODY"))
    await fs.writeFile(path.join(source, "photo.svg"), "<svg>new</svg>")
    const second = await compiler.build()
    await publishRelease(
      second.release,
      second.dependencies,
      compiler.objects,
      target,
      first.release.id,
    )
    const newHome = await fetchPage("/")
    const newHtml = await newHome.text()
    assert.match(newHtml, /NEW BODY/)
    assert.doesNotMatch(newHtml, /ORIGINAL BODY/)
    assert.equal(newHome.headers.get("X-Content-Release"), second.release.id)
    assert.equal(await (await fetchPage(pinned)).text(), "<svg>original</svg>")
    assert.equal(await (await fetchPage("/photo.svg")).text(), "<svg>new</svg>")
  } finally {
    if (previousCaches) Object.defineProperty(globalThis, "caches", previousCaches)
    else Reflect.deleteProperty(globalThis, "caches")
    compiler.state.close()
    target.db.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})
