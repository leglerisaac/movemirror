import { Chess } from "chess.js"

import type { TrainingPosition } from "./types"

export interface EngineFinding {
  positionId: string
  bestMove: string
  bestMoveSan: string
  evaluation: string
  depth: number
}

interface StockfishEngine {
  addMessageListener: (listener: (line: string) => void) => void
  postMessage: (command: string) => void
}

declare global {
  interface Window {
    Stockfish?: () => Promise<StockfishEngine>
  }
}

let scriptPromise: Promise<void> | null = null

function loadStockfishScript() {
  if (window.Stockfish) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "/stockfish/stockfish.js"
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("The Stockfish engine could not be loaded."))
    document.head.appendChild(script)
  })
  return scriptPromise
}

function waitForLine(
  engine: StockfishEngine,
  predicate: (line: string) => boolean,
  timeout = 20_000,
) {
  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("Stockfish took too long to respond.")),
      timeout,
    )
    engine.addMessageListener((line) => {
      if (!predicate(line)) return
      window.clearTimeout(timer)
      resolve(line)
    })
  })
}

function evaluationLabel(type: string, value: number) {
  if (type === "mate") return value > 0 ? `Mate in ${value}` : `Facing mate in ${Math.abs(value)}`
  const pawns = value / 100
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(1)}`
}

function sanFromUci(fen: string, uci: string) {
  try {
    const chess = new Chess(fen)
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length > 4 ? { promotion: uci.slice(4, 5) } : {}),
    })
    return move?.san ?? uci
  } catch {
    return uci
  }
}

export function engineSupported() {
  return typeof window !== "undefined" && window.crossOriginIsolated
}

export async function analyzeTrainingPositions(
  positions: TrainingPosition[],
  onProgress?: (complete: number, total: number) => void,
) {
  if (!engineSupported()) {
    throw new Error("Engine review needs the security headers enabled on chess.leglord.com.")
  }
  await loadStockfishScript()
  if (!window.Stockfish) throw new Error("Stockfish did not initialize.")
  const engine = await window.Stockfish()

  const uciReady = waitForLine(engine, (line) => line === "uciok")
  engine.postMessage("uci")
  await uciReady
  engine.postMessage("setoption name Threads value 1")
  engine.postMessage("setoption name Hash value 32")

  const findings: EngineFinding[] = []
  const selected = positions.slice(0, 8)
  for (const [index, position] of selected.entries()) {
    let latestDepth = 0
    let latestScore = "+0.0"
    engine.addMessageListener((line) => {
      const depth = line.match(/\bdepth (\d+)/)?.[1]
      const score = line.match(/\bscore (cp|mate) (-?\d+)/)
      if (depth) latestDepth = Number(depth)
      if (score) latestScore = evaluationLabel(score[1], Number(score[2]))
    })

    engine.postMessage(`position fen ${position.fen}`)
    const result = waitForLine(engine, (line) => line.startsWith("bestmove "))
    engine.postMessage("go depth 12")
    const bestMoveLine = await result
    const bestMove = bestMoveLine.split(/\s+/)[1]
    findings.push({
      positionId: position.id,
      bestMove,
      bestMoveSan: sanFromUci(position.fen, bestMove),
      evaluation: latestScore,
      depth: latestDepth,
    })
    onProgress?.(index + 1, selected.length)
  }
  engine.postMessage("quit")
  return findings
}
