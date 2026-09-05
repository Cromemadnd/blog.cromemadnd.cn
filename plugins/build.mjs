// Build local plugin forks (plugins/*) into their dist/ with the repo's esbuild.
//
// Mirrors the upstream tsup.config.ts of quartz-community plugins:
// - entries: src/index.ts -> dist/index.js, src/components/index.ts -> dist/components/index.js
// - singleton externals stay external (preact, @jackyzha0/quartz, vfile, unified)
// - *.inline.ts scripts get bundled for the browser and embedded as text strings
// - *.scss files are embedded as text
//
// Local plugins are symlinked into .quartz/plugins by the quartz loader and
// served as-is, so dist must be prebuilt and committed.
import esbuild from "esbuild";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginsRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(pluginsRoot);

const SINGLETON_EXTERNALS = [
  "preact",
  "preact/hooks",
  "preact/jsx-runtime",
  "preact/compat",
  "@jackyzha0/quartz",
  "@jackyzha0/quartz/*",
  "vfile",
  "vfile/*",
  "unified",
];

const inlineScriptPlugin = {
  name: "inline-script-loader",
  setup(build) {
    build.onLoad({ filter: /\.scss$/ }, async (args) => {
      const text = await fs.readFile(args.path, "utf8");
      return { contents: text, loader: "text" };
    });

    build.onLoad({ filter: /\.inline\.ts$/ }, async (args) => {
      let text = await fs.readFile(args.path, "utf8");
      text = text.replace(/^export default /gm, "");
      text = text.replace(/^export /gm, "");

      const result = await esbuild.build({
        stdin: {
          contents: text,
          loader: "ts",
          resolveDir: path.dirname(args.path),
          sourcefile: path.relative(repoRoot, args.path),
        },
        write: false,
        bundle: true,
        minify: true,
        platform: "browser",
        format: "esm",
        target: "es2020",
        sourcemap: false,
        external: ["http://*", "https://*"],
      });

      const js = result.outputFiles?.[0]?.text;
      if (!js) throw new Error(`inline-script-loader: no JS output for ${args.path}`);
      return { contents: js, loader: "text" };
    });
  },
};

const commonOptions = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  sourcemap: true,
  splitting: false,
  external: SINGLETON_EXTERNALS,
  jsx: "automatic",
  jsxImportSource: "preact",
  plugins: [inlineScriptPlugin],
  absWorkingDir: repoRoot,
  logLevel: "info",
  // tsup adds this shim automatically for ESM output; without it, bundled CJS
  // deps (satori, sharp, reading-time) throw "Dynamic require of … is not
  // supported" when Node imports the bundle.
  banner: {
    js: `import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);`,
  },
};

async function buildPlugin(name) {
  const pluginDir = path.join(pluginsRoot, name);
  const srcDir = path.join(pluginDir, "src");
  const distDir = path.join(pluginDir, "dist");

  const entries = { index: path.join(srcDir, "index.ts") };
  if (existsSync(path.join(srcDir, "components", "index.ts"))) {
    entries["components/index"] = path.join(srcDir, "components", "index.ts");
  }

  await fs.rm(distDir, { recursive: true, force: true });
  await esbuild.build({
    ...commonOptions,
    entryPoints: entries,
    outdir: distDir,
  });
  console.log(`✓ built plugins/${name}`);
}

const requested = process.argv.slice(2);
const all = (await fs.readdir(pluginsRoot, { withFileTypes: true }))
  .filter((d) => d.isDirectory() && existsSync(path.join(pluginsRoot, d.name, "src", "index.ts")))
  .map((d) => d.name);

const targets = requested.length > 0 ? requested : all;
for (const name of targets) {
  await buildPlugin(name);
}
