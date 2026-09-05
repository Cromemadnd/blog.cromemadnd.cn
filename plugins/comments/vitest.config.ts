import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

// *.inline.ts must load as its source text (mirroring the esbuild text loader
// used by the real build) so importing the component never executes browser code
const inlineAsText: Plugin = {
  name: "quartz-inline-as-text",
  enforce: "pre",
  load(id) {
    if (id.endsWith(".inline.ts")) {
      return {
        code: `export default ${JSON.stringify(readFileSync(id, "utf8"))}`,
        map: null,
      };
    }
  },
};

export default defineConfig({
  plugins: [inlineAsText],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    reporters: ["default"],
  },
});
