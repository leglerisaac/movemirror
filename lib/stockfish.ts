import { Chess, type Color, type Move, type PieceSymbol } from "chess.js"

import type {
  ChessGame,
  EngineAnalysisSummary,
  EngineCriticalMoment,
  EngineGameSummary,
  EngineMoveClassification,
  EnginePhase,
  EnginePhaseSummary,
  TrainingPosition,
} from "./types"

export interface EngineFinding {
  positionId: string
  bestMove: string
  bestMoveSan: string
  evaluation: string
  depth: number
}

export interface EngineAnalysisProgress {
  complete: number
  total: number
  percent: number
  game: number
  games: number
  label: string
}

export interface PreparedEnginePosition {
  id: string
  fen: string
  afterFen: string
  playedMove: string
  playedMoveUci: string
  gameUrl: string
  opponent: string
  opening: string
  color: "White" | "Black"
  phase: EnginePhase
  moveNumber: number
  gameIndex: number
}

interface SearchResult {
  bestMove: string
  scoreCp: number
  depth: number
  pv: string[]
}

interface StockfishEngine {
  addMessageListener: (listener: (line: string) => void) => void
  postMessage: (command: string) => void
  terminate: () => void
}

interface EngineBus {
  engine: StockfishEngine
  add: (listener: (line: string) => void) => () => void
}

interface AnalyzeOptions {
  maxGames?: number
  maxMoves?: number
  depth?: number
  signal?: AbortSignal
  onProgress?: (progress: EngineAnalysisProgress) => void
}

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
}

function createWorkerEngine(): StockfishEngine {
  const worker = new Worker("/stockfish/stockfish-19-lite-single.js")
  return {
    addMessageListener(listener) {
      worker.addEventListener("message", (event) => listener(String(event.data)))
    },
    postMessage(command) {
      worker.postMessage(command)
    },
    terminate() {
      worker.terminate()
    },
  }
}

function createBus(engine: StockfishEngine): EngineBus {
  const listeners = new Set<(line: string) => void>()
  engine.addMessageListener((line) => {
    for (const listener of listeners) listener(line)
  })
  return {
    engine,
    add(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function waitForLine(
  bus: EngineBus,
  predicate: (line: string) => boolean,
  timeout = 30_000,
) {
  return new Promise<string>((resolve, reject) => {
    let timer = 0
    const cleanup = bus.add((line) => {
      if (!predicate(line)) return
      window.clearTimeout(timer)
      cleanup()
      resolve(line)
    })
    timer = window.setTimeout(() => {
      cleanup()
      reject(new Error("Stockfish took too long to respond."))
    }, timeout)
  })
}

function mateScore(value: number) {
  const direction = value >= 0 ? 1 : -1
  return direction * (100_000 - Math.min(99, Math.abs(value)) * 1_000)
}

function scoreFromLine(line: string) {
  const score = line.match(/\bscore (cp|mate) (-?\d+)/)
  if (!score) return null
  const value = Number(score[2])
  return score[1] === "mate" ? mateScore(value) : value
}

function evaluationLabelFromCp(value: number) {
  if (Math.abs(value) >= 50_000) return value > 0 ? "Winning mate" : "Facing mate"
  const pawns = value / 100
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(1)}`
}

function sanFromUci(fen: string, uci: string) {
  if (!uci || uci === "(none)") return "—"
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

function moveToUci(move: Move) {
  return `${move.from}${move.to}${move.promotion ?? ""}`
}

function openingName(game: ChessGame, headers: Record<string, string>) {
  const source = game.eco ?? headers.ECOUrl ?? headers.Opening
  if (source?.startsWith("http")) {
    try {
      const slug = decodeURIComponent(new URL(source).pathname.split("/").pop() ?? "")
      if (slug) return slug.replace(/-/g, " ")
    } catch {
      // Fall through to a plain label.
    }
  }
  return source || headers.ECO || "Unclassified opening"
}

function enginePhase(chess: Chess, moveNumber: number): EnginePhase {
  let totalMaterial = 0
  let nonPawnMaterial = 0
  let queens = 0
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.type === "k") continue
      totalMaterial += PIECE_VALUES[piece.type]
      if (piece.type !== "p") nonPawnMaterial += PIECE_VALUES[piece.type]
      if (piece.type === "q") queens += 1
    }
  }
  if (moveNumber <= 10) return "Opening"
  if (nonPawnMaterial <= 13 || (queens === 0 && totalMaterial <= 24)) return "Endgame"
  return "Middlegame"
}

function evenlyLimit<T>(items: T[], limit: number) {
  if (items.length <= limit) return items
  return Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.floor((index * items.length) / limit)
    return items[sourceIndex]
  })
}

export function prepareEnginePositions(
  games: ChessGame[],
  username: string,
  maxGames = 8,
  maxMoves = 200,
) {
  const normalized = username.toLowerCase()
  const selectedGames = [...games]
    .sort((a, b) => b.end_time - a.end_time)
    .slice(0, maxGames)
  const positions: PreparedEnginePosition[] = []

  selectedGames.forEach((game, gameIndex) => {
    const isWhite = game.white.username.toLowerCase() === normalized
    const isBlack = game.black.username.toLowerCase() === normalized
    if (!isWhite && !isBlack) return
    const userColor: Color = isWhite ? "w" : "b"
    const opponent = isWhite ? game.black : game.white
    const parsed = new Chess()
    try {
      parsed.loadPgn(game.pgn, { strict: false })
    } catch {
      return
    }
    const moves = parsed.history({ verbose: true })
    if (!moves.length) return
    let replay: Chess
    try {
      replay = new Chess(moves[0].before)
    } catch {
      replay = new Chess()
    }
    const opening = openingName(game, parsed.getHeaders())

    moves.forEach((sourceMove, ply) => {
      const fen = replay.fen()
      const moveNumber = Math.floor(ply / 2) + 1
      const phase = enginePhase(replay, moveNumber)
      let played: Move
      try {
        played = replay.move({
          from: sourceMove.from,
          to: sourceMove.to,
          ...(sourceMove.promotion ? { promotion: sourceMove.promotion } : {}),
        })
      } catch {
        return
      }
      if (played.color !== userColor || moveNumber < 5) return
      positions.push({
        id: `${game.url}#${moveNumber}-${moveToUci(played)}`,
        fen,
        afterFen: replay.fen(),
        playedMove: played.san,
        playedMoveUci: moveToUci(played),
        gameUrl: game.url,
        opponent: opponent.username,
        opening,
        color: isWhite ? "White" : "Black",
        phase,
        moveNumber,
        gameIndex,
      })
    })
  })

  return evenlyLimit(positions, maxMoves)
}

function abortError() {
  const error = new Error("Engine analysis was cancelled.")
  error.name = "AbortError"
  return error
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError()
}

async function startEngine() {
  if (!engineSupported()) {
    throw new Error("This browser does not support the local Stockfish engine.")
  }
  const bus = createBus(createWorkerEngine())
  const uciReady = waitForLine(bus, (line) => line === "uciok")
  bus.engine.postMessage("uci")
  await uciReady
  bus.engine.postMessage("setoption name Threads value 1")
  bus.engine.postMessage("setoption name Hash value 32")
  bus.engine.postMessage("setoption name UCI_AnalyseMode value true")
  const ready = waitForLine(bus, (line) => line === "readyok")
  bus.engine.postMessage("isready")
  await ready
  return bus
}

async function searchPosition(
  bus: EngineBus,
  fen: string,
  depth: number,
  signal?: AbortSignal,
) {
  throwIfAborted(signal)
  let latestDepth = 0
  let latestScore = 0
  let latestPv: string[] = []
  const removeInfo = bus.add((line) => {
    if (!line.startsWith("info ")) return
    const parsedDepth = line.match(/\bdepth (\d+)/)?.[1]
    const parsedScore = scoreFromLine(line)
    const pv = line.match(/\bpv (.+)$/)?.[1]
    if (parsedDepth) latestDepth = Number(parsedDepth)
    if (parsedScore !== null) latestScore = parsedScore
    if (pv) latestPv = pv.trim().split(/\s+/)
  })
  const stopOnAbort = () => bus.engine.postMessage("stop")
  signal?.addEventListener("abort", stopOnAbort, { once: true })
  try {
    bus.engine.postMessage(`position fen ${fen}`)
    const result = waitForLine(bus, (line) => line.startsWith("bestmove "))
    bus.engine.postMessage(`go depth ${depth}`)
    const bestMoveLine = await result
    throwIfAborted(signal)
    return {
      bestMove: bestMoveLine.split(/\s+/)[1] ?? "(none)",
      scoreCp: latestScore,
      depth: latestDepth,
      pv: latestPv,
    } satisfies SearchResult
  } finally {
    removeInfo()
    signal?.removeEventListener("abort", stopOnAbort)
  }
}

export function classifyCentipawnLoss(loss: number): EngineMoveClassification {
  if (loss < 20) return "Best"
  if (loss < 60) return "Good"
  if (loss < 120) return "Inaccuracy"
  if (loss < 250) return "Mistake"
  return "Blunder"
}

function precisionForLoss(loss: number) {
  return Math.max(0, Math.min(100, 100 * Math.exp(-Math.min(loss, 1_500) / 450)))
}

function rounded(value: number) {
  return Math.round(value * 10) / 10
}

function themeForMoment(position: PreparedEnginePosition, punishmentMove: string) {
  try {
    const punishment = new Chess(position.afterFen)
    const move = punishment.move({
      from: punishmentMove.slice(0, 2),
      to: punishmentMove.slice(2, 4),
      ...(punishmentMove.length > 4 ? { promotion: punishmentMove.slice(4, 5) } : {}),
    })
    if (punishment.isCheckmate()) {
      return { category: "Checkmate Patterns", lichessTheme: "mate", reason: "The move allowed a forcing mate." }
    }
    if (move?.isCapture()) {
      const valuable = move.captured && PIECE_VALUES[move.captured] >= 3
      return valuable
        ? { category: "Loose & Hanging Pieces", lichessTheme: "hangingPiece", reason: "The move allowed an immediate capture of a valuable piece." }
        : { category: "Winning Material", lichessTheme: "advantage", reason: "The opponent could answer with a forcing material gain." }
    }
    if (punishment.isCheck()) {
      return { category: "Defensive Moves", lichessTheme: "defensiveMove", reason: "The move allowed a forcing check and surrendered control of the position." }
    }
  } catch {
    // Use a phase-based fallback below.
  }
  if (position.phase === "Endgame") {
    return { category: "Endgame Tactics", lichessTheme: "endgame", reason: "The move lost significant value in a reduced-material position." }
  }
  return { category: "Defensive Moves", lichessTheme: "defensiveMove", reason: "The move missed the opponent’s strongest forcing continuation." }
}

function summarizePhases(moments: EngineCriticalMoment[]): EnginePhaseSummary[] {
  return (["Opening", "Middlegame", "Endgame"] as EnginePhase[]).flatMap((phase) => {
    const matching = moments.filter((moment) => moment.phase === phase)
    if (!matching.length) return []
    const totalLoss = matching.reduce((sum, moment) => sum + moment.centipawnLoss, 0)
    return [{
      phase,
      moves: matching.length,
      averageCentipawnLoss: rounded(totalLoss / matching.length),
      precision: rounded(matching.reduce((sum, moment) => sum + precisionForLoss(moment.centipawnLoss), 0) / matching.length),
      inaccuracies: matching.filter((moment) => moment.classification === "Inaccuracy").length,
      mistakes: matching.filter((moment) => moment.classification === "Mistake").length,
      blunders: matching.filter((moment) => moment.classification === "Blunder").length,
    }]
  })
}

function summarizeGames(moments: EngineCriticalMoment[]): EngineGameSummary[] {
  const grouped = new Map<string, EngineCriticalMoment[]>()
  for (const moment of moments) {
    const group = grouped.get(moment.gameUrl) ?? []
    group.push(moment)
    grouped.set(moment.gameUrl, group)
  }
  return [...grouped.entries()].map(([gameUrl, gameMoments]) => {
    const totalLoss = gameMoments.reduce((sum, moment) => sum + moment.centipawnLoss, 0)
    return {
      gameUrl,
      opponent: gameMoments[0].opponent,
      moves: gameMoments.length,
      averageCentipawnLoss: rounded(totalLoss / gameMoments.length),
      precision: rounded(gameMoments.reduce((sum, moment) => sum + precisionForLoss(moment.centipawnLoss), 0) / gameMoments.length),
      inaccuracies: gameMoments.filter((moment) => moment.classification === "Inaccuracy").length,
      mistakes: gameMoments.filter((moment) => moment.classification === "Mistake").length,
      blunders: gameMoments.filter((moment) => moment.classification === "Blunder").length,
    }
  })
}

export function summarizeEngineMoments(
  moments: EngineCriticalMoment[],
  depth: number,
): EngineAnalysisSummary {
  const totalLoss = moments.reduce((sum, moment) => sum + moment.centipawnLoss, 0)
  const games = summarizeGames(moments)
  return {
    engine: "Stockfish 19 Lite",
    depth,
    gamesAnalyzed: games.length,
    movesAnalyzed: moments.length,
    averageCentipawnLoss: moments.length ? rounded(totalLoss / moments.length) : 0,
    precision: moments.length
      ? rounded(moments.reduce((sum, moment) => sum + precisionForLoss(moment.centipawnLoss), 0) / moments.length)
      : 0,
    inaccuracies: moments.filter((moment) => moment.classification === "Inaccuracy").length,
    mistakes: moments.filter((moment) => moment.classification === "Mistake").length,
    blunders: moments.filter((moment) => moment.classification === "Blunder").length,
    phases: summarizePhases(moments),
    games,
    criticalMoments: moments
      .filter((moment) => moment.centipawnLoss >= 60)
      .sort((a, b) => b.centipawnLoss - a.centipawnLoss)
      .slice(0, 12),
    completedAt: Date.now(),
  }
}

export function engineSupported() {
  return typeof window !== "undefined" && typeof Worker === "function" && typeof WebAssembly === "object"
}

export async function analyzeGamesWithEngine(
  games: ChessGame[],
  username: string,
  options: AnalyzeOptions = {},
) {
  const maxGames = options.maxGames ?? 8
  const maxMoves = options.maxMoves ?? 200
  const depth = options.depth ?? 10
  const positions = prepareEnginePositions(games, username, maxGames, maxMoves)
  if (!positions.length) throw new Error("No playable positions were available for engine analysis.")
  const bus = await startEngine()
  const moments: EngineCriticalMoment[] = []
  const gameIndexes = [...new Set(positions.map((position) => position.gameIndex))]
  const gameCount = gameIndexes.length

  try {
    bus.engine.postMessage("ucinewgame")
    for (const [index, position] of positions.entries()) {
      throwIfAborted(options.signal)
      const before = await searchPosition(bus, position.fen, depth, options.signal)
      const after = await searchPosition(bus, position.afterFen, depth, options.signal)
      const evaluationAfter = -after.scoreCp
      const centipawnLoss = before.bestMove === position.playedMoveUci
        ? 0
        : Math.max(0, Math.min(2_000, before.scoreCp - evaluationAfter))
      const classification = classifyCentipawnLoss(centipawnLoss)
      const theme = themeForMoment(position, after.bestMove)
      moments.push({
        ...position,
        bestMove: before.bestMove,
        bestMoveSan: sanFromUci(position.fen, before.bestMove),
        punishmentMove: after.bestMove,
        punishmentMoveSan: sanFromUci(position.afterFen, after.bestMove),
        evaluationBefore: before.scoreCp,
        evaluationAfter,
        centipawnLoss,
        classification,
        ...theme,
      })
      const complete = index + 1
      options.onProgress?.({
        complete,
        total: positions.length,
        percent: Math.round((complete / positions.length) * 100),
        game: gameIndexes.indexOf(position.gameIndex) + 1,
        games: gameCount,
        label: `Checking move ${position.moveNumber} against ${position.opponent}`,
      })
    }
    return summarizeEngineMoments(moments, depth)
  } finally {
    bus.engine.postMessage("quit")
    bus.engine.terminate()
  }
}

export async function analyzeTrainingPositions(
  positions: TrainingPosition[],
  onProgress?: (complete: number, total: number) => void,
) {
  const bus = await startEngine()
  const findings: EngineFinding[] = []
  const selected = positions.slice(0, 8)
  try {
    for (const [index, position] of selected.entries()) {
      const result = await searchPosition(bus, position.fen, 12)
      findings.push({
        positionId: position.id,
        bestMove: result.bestMove,
        bestMoveSan: sanFromUci(position.fen, result.bestMove),
        evaluation: evaluationLabelFromCp(result.scoreCp),
        depth: result.depth,
      })
      onProgress?.(index + 1, selected.length)
    }
    return findings
  } finally {
    bus.engine.postMessage("quit")
    bus.engine.terminate()
  }
}
