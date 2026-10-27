import fs from "node:fs/promises"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { globby } from "globby"

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
export async function readJson(filename, fallback) {
  try {
    return JSON.parse(await fs.readFile(filename, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return fallback
    throw error
  }
}
export async function writeJson(filename, value) {
  const temporary = `${filename}.${randomUUID()}.tmp`
  await fs.writeFile(temporary, JSON.stringify(value, null, 2))
  await fs.rename(temporary, filename)
}
export function assertSeparate(source, state) {
  for (const [parent, child] of [
    [source, state],
    [state, source],
  ]) {
    const relative = path.relative(parent, child)
    if (
      !relative ||
      (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
    ) {
      throw new Error("Source and publisher state must be separate, non-nested directories")
    }
  }
}

// Bound open files/large buffers, preserve input order, and drain in-flight writes
// before reporting an error so callers can safely remove an incomplete snapshot.
export async function mapFiles(values, action) {
  const results = new Array(values.length)
  let next = 0
  let failed = false
  let failure
  await Promise.all(
    Array.from({ length: Math.min(4, values.length) }, async () => {
      while (!failed) {
        const index = next++
        if (index >= values.length) return
        try {
          results[index] = await action(values[index], index)
        } catch (error) {
          failed = true
          failure = error
        }
      }
    }),
  )
  if (failed) throw failure
  return results
}

export async function scanSource(source, ignore) {
  const paths = (
    await globby("**/*", {
      cwd: source,
      ignore: [...ignore, "**/.obsidian/**", "**/.git/**"],
      followSymbolicLinks: false,
      onlyFiles: true,
    })
  ).sort()
  await fs.access(source)
  const entries = await mapFiles(paths, async (relative) => {
    const filename = path.join(source, relative)
    const before = await fs.lstat(filename)
    if (!before.isFile()) throw new Error(`Not a regular source file: ${relative}`)
    const bytes = await fs.readFile(filename)
    const after = await fs.lstat(filename)
    if (
      before.ino !== after.ino ||
      before.mtimeMs !== after.mtimeMs ||
      before.size !== after.size
    ) {
      throw new Error(`Source changed while reading: ${relative}`)
    }
    return [relative, { hash: hash(bytes), mtimeMs: after.mtimeMs, birthtimeMs: after.birthtimeMs }]
  })
  const files = Object.fromEntries(entries)
  return { files, id: hash(JSON.stringify(files)) }
}

export async function captureSource(source, directory, expected) {
  await fs.mkdir(directory, { recursive: false })
  await mapFiles(Object.entries(expected.files), async ([relative, info]) => {
    const bytes = await fs.readFile(path.join(source, relative))
    if (hash(bytes) !== info.hash) throw new Error(`Source changed during snapshot: ${relative}`)
    const target = path.join(directory, relative)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, bytes)
    await fs.utimes(target, info.mtimeMs / 1000, info.mtimeMs / 1000)
  })
  return { ...expected, directory }
}

// This inventory is for local integrity/no-op checks; Wrangler owns the upload hash format.
export async function inventory(directory) {
  const entries = (
    await globby("**/*", {
      cwd: directory,
      dot: true,
      followSymbolicLinks: false,
      onlyFiles: false,
    })
  ).sort()
  const results = await mapFiles(entries, async (relative) => {
    const filename = path.join(directory, relative)
    const stat = await fs.lstat(filename)
    if (stat.isSymbolicLink()) throw new Error(`Symlink in output: ${relative}`)
    if (stat.isDirectory()) return null
    if (!stat.isFile()) throw new Error(`Not a regular output file: ${relative}`)
    if (stat.size > 25 * 1024 * 1024) throw new Error(`Static asset exceeds 25 MiB: ${relative}`)
    return [relative, { hash: hash(await fs.readFile(filename)), size: stat.size }]
  })
  const files = Object.fromEntries(results.filter(Boolean))
  // Conservative free-plan limit, including the reserved headers file.
  if (Object.keys(files).length > 20000) throw new Error("Static output exceeds 20,000 files")
  if (!files["index.html"]) throw new Error("Missing index.html; refusing incomplete deployment")
  return { files, id: hash(JSON.stringify(files)) }
}

export async function finalizeOutput(directory) {
  // Notes/attachments must not be able to inject hosting configuration.
  for (const name of ["_headers", "_redirects", ".assetsignore", "_worker.js"]) {
    try {
      await fs.access(path.join(directory, name))
      throw new Error(`Reserved output name: ${name}`)
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
  }
  // No immutable overrides: same-name images and JSON must revalidate too.
  await fs.writeFile(
    path.join(directory, "_headers"),
    "/*\n  Cache-Control: public, max-age=0, must-revalidate\n",
  )
  return inventory(directory)
}

export async function pointSnapshot(state, directory) {
  const temporary = path.join(state, `snapshot-${randomUUID()}`)
  await fs.symlink(path.relative(state, directory), temporary, "dir")
  await fs.rename(temporary, path.join(state, "snapshot"))
}
