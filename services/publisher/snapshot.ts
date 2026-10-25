import fs from "node:fs/promises"
import path from "node:path"
import { globby } from "globby"
import { hash, stableJson } from "./hash"
import type { SourceInfo } from "./plan"

export interface Snapshot {
  id: string
  directory: string
  files: Record<string, SourceInfo>
}

export async function snapshot(
  source: string,
  destination: string,
  ignore: string[],
): Promise<Snapshot> {
  await fs.access(source)
  const paths = (
    await globby("**/*", {
      cwd: source,
      ignore: [...ignore, "**/.obsidian/**", "**/.git/**"],
      followSymbolicLinks: false,
      onlyFiles: true,
    })
  ).sort()
  const files: Record<string, SourceInfo> = {}
  const contents = new Map<string, Buffer>()
  for (const filename of paths) {
    const fullPath = path.join(source, filename)
    const before = await fs.lstat(fullPath)
    if (!before.isFile()) throw new Error(`Not a regular source file: ${filename}`)
    const bytes = await fs.readFile(fullPath)
    const after = await fs.lstat(fullPath)
    if (
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ino !== after.ino
    ) {
      throw new Error(`Source changed during snapshot; retrying: ${filename}`)
    }
    contents.set(filename, bytes)
    files[filename] = { hash: hash(bytes), mtimeMs: after.mtimeMs, birthtimeMs: after.birthtimeMs }
  }
  const id = hash(stableJson(files))
  const directory = path.join(destination, id)
  await fs.mkdir(directory, { recursive: true })
  for (const [filename, bytes] of contents) {
    const target = path.join(directory, filename)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, bytes)
    await fs.utimes(target, new Date(files[filename].mtimeMs), new Date(files[filename].mtimeMs))
  }
  return { id, directory, files }
}
