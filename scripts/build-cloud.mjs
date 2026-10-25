import esbuild from "esbuild"
import { sassPlugin } from "esbuild-sass-plugin"
import { globby } from "globby"
import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import YAML from "yaml"
import { createRequire } from "node:module"

await fs.mkdir(".cloud", { recursive: true })
const config = YAML.parse(await fs.readFile("quartz.config.yaml", "utf8"))
const inputs = await globby(
  [
    "quartz/**/*.{ts,tsx,scss}",
    "plugins/*/dist/**/*.js",
    "plugins/*/src/**/*.{ts,tsx,scss}",
    ".quartz/plugins/*/dist/**/*.js",
    ".quartz/plugins/*/src/**/*.{ts,tsx,scss}",
    "services/**/*.ts",
    "shared/**/*.ts",
    "apps/**/*.{ts,tsx}",
    "scripts/build-cloud.mjs",
    "quartz.config.yaml",
    "quartz.ts",
    "quartz.lock.json",
    "package.json",
    "pnpm-lock.yaml",
  ],
  { dot: true, ignore: ["**/node_modules/**", "**/*.test.ts", "**/.quartz-cache/**"] },
)
const digest = createHash("sha256")
for (const filename of inputs.sort()) digest.update(filename).update(await fs.readFile(filename))
const rendererId = digest.digest("hex").slice(0, 32)
await fs.writeFile(".cloud/build-info.json", JSON.stringify({ rendererId }, null, 2))

const inlineLoader = {
  name: "quartz-inline-script",
  setup(build) {
    build.onLoad({ filter: /\.inline\.(ts|js)$/ }, async ({ path: filename }) => {
      let contents = await fs.readFile(filename, "utf8")
      contents = contents.replace(/^export default /gm, "").replace(/^export /gm, "")
      const result = await esbuild.build({
        stdin: { contents, loader: "ts", resolveDir: path.dirname(filename), sourcefile: filename },
        write: false,
        bundle: true,
        platform: "browser",
        format: "esm",
        minify: true,
      })
      return { contents: result.outputFiles[0].text, loader: "text" }
    })
  },
}

await esbuild.build({
  entryPoints: {
    compiler: "services/publisher/compiler.ts",
    ...(existsSync("services/publisher/main.ts")
      ? { publisher: "services/publisher/main.ts" }
      : {}),
  },
  outdir: ".cloud",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  keepNames: true,
  jsx: "automatic",
  jsxImportSource: "preact",
  sourcemap: true,
  define: { __QUARTZ_RENDERER_ID__: JSON.stringify(rendererId) },
  banner: {
    js: 'import { createRequire as __cloudRequire } from "node:module"; const require = __cloudRequire(import.meta.url);',
  },
  plugins: [sassPlugin({ type: "css-text", cssImports: true }), inlineLoader],
  logLevel: "warning",
})

// Generate static component imports. Neither the YAML filesystem loader nor plugin installers
// may be reachable from the Worker bundle. Fail on missing component/frame entrypoints.
const lines = [
  'import { componentRegistry } from "../quartz/components/registry"',
  'import { frameRegistry } from "../quartz/components/frames/registry"',
  'import { buildQuartzLayout } from "../quartz/components/layout"',
]
let index = 0
for (const entry of config.plugins.filter((entry) => entry.enabled)) {
  const value = typeof entry.source === "string" ? entry.source : entry.source.repo
  const name = value
    .split("#")[0]
    .replace(/\.git$/, "")
    .split("/")
    .pop()
  const directory = path.resolve(".quartz/plugins", name)
  const pkg = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"))
  const manifest = pkg.quartz ?? {}
  for (const [kind, exports] of [
    ["components", manifest.components],
    ["frames", manifest.frames],
  ]) {
    if (!exports || !Object.keys(exports).length) continue
    const source = path.join(directory, "src", kind, "index.ts")
    const distExport = pkg.exports?.[`./${kind}`]
    const target = existsSync(source)
      ? source
      : path.join(
          directory,
          typeof distExport === "string"
            ? distExport
            : (distExport?.import ?? `dist/${kind}/index.js`),
        )
    if (!existsSync(target)) throw new Error(`Missing ${kind} for ${name}`)
    const variable = `plugin${index++}`
    const relative = path.relative(path.resolve(".cloud"), target).split(path.sep).join("/")
    lines.push(`import * as ${variable} from ${JSON.stringify(relative)}`)
    for (const [exportName, info] of Object.entries(exports)) {
      if (kind === "components") {
        for (const key of [
          `${name}/${exportName}`,
          exportName,
          ...(Object.keys(exports).length === 1 ? [name] : []),
        ]) {
          lines.push(
            `componentRegistry.register(${JSON.stringify(key)}, ${variable}[${JSON.stringify(exportName)}], ${JSON.stringify(name)}, ${JSON.stringify(info)})`,
          )
        }
      } else {
        const frameName = info.name ?? exportName
        lines.push(
          `frameRegistry.register(${JSON.stringify(frameName)}, ${variable}[${JSON.stringify(exportName)}], ${JSON.stringify(name)})`,
        )
      }
    }
  }
}
lines.push(`export const layout = buildQuartzLayout(${JSON.stringify(config)})`)
lines.push(`export const rendererId = ${JSON.stringify(rendererId)}`)
await fs.writeFile(".cloud/runtime-layout.mjs", lines.join("\n"))
await fs.writeFile(
  ".cloud/runtime-layout.d.mts",
  `import type { FullPageLayout } from "../quartz/cfg";
export declare const layout: { defaults: Partial<FullPageLayout>; byPageType: Record<string, Partial<FullPageLayout>> };
export declare const rendererId: string;
`,
)

if (existsSync("apps/worker/src/index.ts")) {
  await esbuild
    .build({
      entryPoints: ["apps/worker/src/index.ts"],
      outfile: ".cloud/worker.mjs",
      bundle: true,
      platform: "browser",
      format: "esm",
      target: "es2022",
      jsx: "automatic",
      jsxImportSource: "preact",
      minify: true,
      metafile: true,
      external: ["node:crypto", "node:util", "crypto", "util"],
      plugins: [
        sassPlugin({ type: "css-text", cssImports: true }),
        {
          name: "omit-build-resources",
          setup(build) {
            // The string-only reading-time API works on Workers; its root also loads a Node stream.
            build.onResolve({ filter: /^reading-time$/ }, ({ resolveDir }) => ({
              path: createRequire(path.join(resolveDir, "package.json")).resolve(
                "reading-time/lib/reading-time",
              ),
            }))
            build.onResolve({ filter: /^style-to-js$/ }, ({ resolveDir }) => ({
              path: createRequire(path.join(resolveDir, "package.json")).resolve("style-to-js"),
              namespace: "style-to-js-interop",
            }))
            build.onLoad(
              { filter: /.*/, namespace: "style-to-js-interop" },
              ({ path: filename }) => ({
                contents: `import value from ${JSON.stringify(filename)}; export default typeof value === "function" ? value : value.default;`,
                loader: "js",
                resolveDir: path.dirname(filename),
              }),
            )
            build.onLoad({ filter: /\.inline\.(ts|js)$/ }, () => ({
              contents: "",
              loader: "text",
            }))
          },
        },
      ],
      write: true,
    })
    .then(async (result) => {
      await fs.writeFile(".cloud/worker-meta.json", JSON.stringify(result.metafile))
    })
}
console.log(`Cloud bundles ready (renderer ${rendererId})`)
