import fs from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import YAML from "yaml"

const config = YAML.parse(await fs.readFile("quartz.config.yaml", "utf8"))
const lock = JSON.parse(await fs.readFile("quartz.lock.json", "utf8"))
const cache = path.resolve(".quartz/plugins")
await fs.mkdir(cache, { recursive: true })
function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`)
  return result.stdout.trim()
}
for (const entry of config.plugins.filter((item) => item.enabled)) {
  const value = typeof entry.source === "string" ? entry.source : entry.source.repo
  const name = value
    .split("#")[0]
    .replace(/\.git$/, "")
    .split("/")
    .pop()
  const directory = path.join(cache, name)
  let exists = true
  try {
    await fs.lstat(directory)
  } catch {
    exists = false
  }
  if (value.startsWith("./") || value.startsWith("../") || value.startsWith("/")) {
    const source = path.resolve(value)
    if (exists) {
      if ((await fs.realpath(directory)) !== (await fs.realpath(source)))
        throw new Error(
          `Wrong cached plugin at ${directory}; move it aside before preparing local ${name}`,
        )
    } else await fs.symlink(source, directory, "dir")
  } else {
    const pinned = lock.plugins[name]
    if (!pinned || !/^[0-9a-f]{40}$/.test(pinned.commit) || pinned.subdir)
      throw new Error(`Missing supported pinned Git plugin in quartz.lock.json: ${name}`)
    if (!exists) {
      const temporary = `${directory}.install-${process.pid}`
      await fs.mkdir(temporary)
      git(["init", "--quiet"], temporary)
      git(["remote", "add", "origin", pinned.resolved], temporary)
      git(["fetch", "--quiet", "--depth=1", "origin", pinned.commit], temporary)
      git(["checkout", "--quiet", "--detach", "FETCH_HEAD"], temporary)
      await fs.rename(temporary, directory)
    }
    if (git(["rev-parse", "HEAD"], directory) !== pinned.commit)
      throw new Error(
        `Cached ${name} differs from quartz.lock.json; refusing to change it automatically`,
      )
  }
  const pkg = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"))
  const exported = pkg.exports?.["."]
  const main =
    typeof exported === "string" ? exported : (exported?.import ?? pkg.main ?? "dist/index.js")
  await fs.access(path.join(directory, main))
  console.log(`Prepared ${name}`)
}
