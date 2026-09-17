import { cpSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

const source = resolve("node_modules/stockfish.wasm")
const destination = resolve("public/stockfish")

mkdirSync(destination, { recursive: true })
for (const file of ["stockfish.js", "stockfish.wasm", "stockfish.worker.js", "Copying.txt"]) {
  cpSync(resolve(source, file), resolve(destination, file))
}

console.log("Prepared browser Stockfish assets")
