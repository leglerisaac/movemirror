import { cpSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const exportRoot = resolve("dist/client")
const prefixedAssets = resolve(exportRoot, "movemirror/_next")
const servedAssets = resolve(exportRoot, "_next")

if (!existsSync(resolve(exportRoot, "index.html"))) {
  throw new Error("Static export is missing dist/client/index.html")
}

if (!existsSync(prefixedAssets)) {
  throw new Error("GitHub Pages assets were not generated at the expected prefix")
}

cpSync(prefixedAssets, servedAssets, { recursive: true })
console.log("GitHub Pages artifact is ready at dist/client")
