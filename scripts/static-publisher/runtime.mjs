import esbuild from "esbuild"
import { sassPlugin } from "esbuild-sass-plugin"
import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { globby } from "globby"
import { pathToFileURL } from "node:url"

export async function loadCompiler(state, { skipOgImages = false } = {}) {
  const directory = path.resolve("quartz/.quartz-cache", `static-${process.pid}`)
  await fs.mkdir(directory, { recursive: true })
  const result = await esbuild.build({
    entryPoints: ["services/static/compiler.ts"],
    outfile: path.join(directory, "compiler.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    keepNames: true,
    jsx: "automatic",
    jsxImportSource: "preact",
    metafile: true,
    write: true,
    banner: {
      js: 'import { createRequire as __staticRequire } from "node:module"; const require = __staticRequire(import.meta.url);',
    },
    plugins: [
      sassPlugin({ type: "css-text", cssImports: true }),
      {
        name: "quartz-inline-script",
        setup(build) {
          build.onLoad({ filter: /\.inline\.(ts|js)$/ }, async ({ path: filename }) => {
            const contents = (await fs.readFile(filename, "utf8"))
              .replace(/^export default /gm, "")
              .replace(/^export /gm, "")
            const inline = await esbuild.build({
              stdin: {
                contents,
                loader: "ts",
                resolveDir: path.dirname(filename),
                sourcefile: filename,
              },
              write: false,
              bundle: true,
              platform: "browser",
              format: "esm",
              minify: true,
            })
            return { contents: inline.outputFiles[0].text, loader: "text" }
          })
        },
      },
    ],
    logLevel: "warning",
  })
  // Plugins are loaded dynamically. Include their dist and source as well as the bundle.
  const paths = await globby(
    [
      "quartz.config.yaml",
      "quartz.lock.json",
      "pnpm-lock.yaml",
      "package.json",
      "quartz/static/**/*",
      ".quartz/plugins/**/dist/**/*",
      ".quartz/plugins/**/src/**/*",
      "plugins/*/dist/**/*",
      "plugins/*/src/**/*",
    ],
    { dot: true, ignore: ["**/node_modules/**", "**/.git/**"], followSymbolicLinks: true },
  )
  const hash = createHash("sha256").update(JSON.stringify({ skipOgImages }))
  for (const filename of [...new Set([...Object.keys(result.metafile.inputs), ...paths])].sort()) {
    hash.update(filename).update(await fs.readFile(filename))
  }
  const { StaticCompiler } = await import(pathToFileURL(path.join(directory, "compiler.mjs")))
  return {
    compiler: new StaticCompiler(state, skipOgImages),
    id: hash.digest("hex"),
    runtimeDirectory: directory,
  }
}
