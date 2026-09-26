import { cpSync, mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"

const source = resolve("node_modules/stockfish")
const destination = resolve("public/stockfish")

mkdirSync(destination, { recursive: true })
rmSync(resolve(destination, "stockfish.worker.js"), { force: true })
rmSync(resolve(destination, "stockfish.js"), { force: true })
rmSync(resolve(destination, "stockfish.wasm"), { force: true })
cpSync(resolve(source, "bin/stockfish-19-lite-single.js"), resolve(destination, "stockfish-19-lite-single.js"))
cpSync(resolve(source, "bin/stockfish-19-lite-single.wasm"), resolve(destination, "stockfish-19-lite-single.wasm"))
cpSync(resolve(source, "Copying.txt"), resolve(destination, "Copying.txt"))

console.log("Prepared Stockfish 19 NNUE browser assets")
