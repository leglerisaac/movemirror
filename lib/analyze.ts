import { Chess, SQUARES, type Color, type Move, type PieceSymbol, type Square } from "chess.js"

import type {
  AnalysisReport,
  ChessGame,
  ChessPlatform,
  DiagnosticMetrics,
  Finding,
  GameSummary,
  OpeningSummary,
  Outcome,
  PuzzleRecommendation,
  RecordSummary,
  SplitSummary,
  TrainingPosition,
  TrainingPositionCategory,
} from "./types"

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
}

const DRAW_RESULTS = new Set([
  "agreed",
  "stalemate",
  "repetition",
  "insufficient",
  "50move",
  "timevsinsufficient",
])

interface BoundarySnapshot {
  move: number
  balance: number
  totalMaterial: number
}

interface GameDiagnostic {
  summary: GameSummary
  outcome: Outcome
  score: number
  openingEligible: boolean
  openingClean: boolean
  openingDeficit: boolean
  developmentScore: number | null
  middlegameEligible: boolean
  middlegameDrops: number
  reachedEndgame: boolean
  castlingEligible: boolean
  castled: boolean
  hangingLosses: number
  forkExposures: number
  linePressureExposures: number
  checkmateLoss: boolean
  backRankLoss: boolean
  timeoutLoss: boolean
  advantageChance: boolean
  convertedAdvantage: boolean
  deficitGame: boolean
  savedDeficit: boolean
  trainingPositions: TrainingPosition[]
}

interface UserDecision {
  fen: string
  moveNumber: number
  playedMove: string
}

interface RankedFinding extends Finding {
  key: string
}

interface RankedRecommendation extends PuzzleRecommendation {
  key: string
}

function opposite(color: Color): Color {
  return color === "w" ? "b" : "w"
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function percent(value: number) {
  return Math.round(clamp(value) * 10) / 10
}

function outcomeFromResult(result: string): Outcome {
  if (result === "win") return "win"
  if (DRAW_RESULTS.has(result)) return "draw"
  return "loss"
}

function outcomeScore(outcome: Outcome) {
  if (outcome === "win") return 1
  if (outcome === "draw") return 0.5
  return 0
}

function titleCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function openingName(game: ChessGame, headers: Record<string, string>) {
  const source = game.eco ?? headers.ECOUrl ?? headers.Opening

  if (source?.startsWith("http")) {
    try {
      const slug = decodeURIComponent(new URL(source).pathname.split("/").pop() ?? "")
      if (slug) return titleCase(slug)
    } catch {
      // Fall back to PGN headers below.
    }
  }

  if (source) return titleCase(source)
  if (headers.ECO) return `ECO ${headers.ECO}`
  return "Unclassified opening"
}

function boardMaterial(chess: Chess, userColor: Color) {
  let user = 0
  let opponent = 0
  let total = 0
  let nonKingPieces = 0
  let queens = 0

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.type === "k") continue
      const value = PIECE_VALUES[piece.type]
      total += value
      nonKingPieces += 1
      if (piece.type === "q") queens += 1
      if (piece.color === userColor) user += value
      else opponent += value
    }
  }

  return {
    balance: user - opponent,
    total,
    nonKingPieces,
    queens,
  }
}

function isEndgame(chess: Chess) {
  const material = boardMaterial(chess, "w")
  return (
    material.nonKingPieces <= 10 ||
    (material.queens === 0 && material.total <= 26)
  )
}

function loosePieceSquares(chess: Chess, color: Color) {
  const enemy = opposite(color)
  const loose = new Set<Square>()

  for (const square of SQUARES) {
    const piece = chess.get(square)
    if (!piece || piece.color !== color || piece.type === "p" || piece.type === "k") {
      continue
    }

    if (
      chess.attackers(square, enemy).length > 0 &&
      chess.attackers(square, color).length === 0
    ) {
      loose.add(square)
    }
  }

  return loose
}

function createsFork(chess: Chess, move: Move, userColor: Color) {
  const attacker = chess.get(move.to)
  if (!attacker || attacker.color === userColor) return false

  const targets = SQUARES.flatMap((square) => {
    const piece = chess.get(square)
    if (!piece || piece.color !== userColor || piece.type === "p") return []
    if (!chess.attackers(square, attacker.color).includes(move.to)) return []
    return [piece]
  })

  if (targets.length < 2) return false
  const totalTargetValue = targets.reduce(
    (sum, piece) => sum + (piece.type === "k" ? 6 : PIECE_VALUES[piece.type]),
    0,
  )
  return targets.some((piece) => piece.type === "k" || piece.type === "q") || totalTargetValue >= 8
}

const FILES = "abcdefgh"

function squareAt(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null
  return `${FILES[file]}${rank}` as Square
}

function createsLinePressure(chess: Chess, move: Move, userColor: Color) {
  const attacker = chess.get(move.to)
  if (!attacker || attacker.color === userColor) return false
  if (!(["b", "r", "q"] as PieceSymbol[]).includes(attacker.type)) return false

  const file = FILES.indexOf(move.to[0])
  const rank = Number(move.to[1])
  const diagonal = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]
  const straight = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  const directions =
    attacker.type === "b" ? diagonal : attacker.type === "r" ? straight : [...diagonal, ...straight]

  return directions.some(([fileStep, rankStep]) => {
    const pieces: Array<{ type: PieceSymbol; color: Color }> = []

    for (let distance = 1; distance < 8; distance += 1) {
      const square = squareAt(file + fileStep * distance, rank + rankStep * distance)
      if (!square) break
      const piece = chess.get(square)
      if (piece) pieces.push(piece)
      if (pieces.length === 2) break
    }

    if (pieces.length < 2) return false
    const [front, behind] = pieces
    if (front.color !== userColor || behind.color !== userColor) return false

    return (
      front.type === "k" ||
      behind.type === "k" ||
      front.type === "q" ||
      behind.type === "q" ||
      PIECE_VALUES[behind.type] > PIECE_VALUES[front.type]
    )
  })
}

function isBackRankMate(chess: Chess, userColor: Color, lastMove: Move | null) {
  if (!chess.isCheckmate() || !lastMove || !["q", "r"].includes(lastMove.piece)) {
    return false
  }

  const kingSquare = chess.findPiece({ color: userColor, type: "k" })[0]
  if (!kingSquare) return false
  return userColor === "w" ? kingSquare.endsWith("1") : kingSquare.endsWith("8")
}

function persistentMaterialDrops(boundaries: BoundarySnapshot[]) {
  const drops: {
    opening: number
    middlegame: number
    endgame: number
    moves: number[]
  } = { opening: 0, middlegame: 0, endgame: 0, moves: [] }

  for (let index = 1; index < boundaries.length; index += 1) {
    const previous = boundaries[index - 1]
    const current = boundaries[index]
    const next = boundaries[index + 1]
    const drop = previous.balance - current.balance
    const persists = !next || next.balance <= previous.balance - 1

    if (drop < 2 || !persists) continue
    drops.moves.push(current.move)
    if (current.move <= 10) drops.opening += 1
    else if (current.move <= 30) drops.middlegame += 1
    else drops.endgame += 1
  }

  return drops
}

function parseGame(game: ChessGame, username: string): GameDiagnostic | null {
  const normalized = username.toLowerCase()
  const isWhite = game.white.username.toLowerCase() === normalized
  const isBlack = game.black.username.toLowerCase() === normalized
  if (!isWhite && !isBlack) return null

  const userColor: Color = isWhite ? "w" : "b"
  const player = isWhite ? game.white : game.black
  const opponent = isWhite ? game.black : game.white
  const result = outcomeFromResult(player.result)

  const parsed = new Chess()
  try {
    parsed.loadPgn(game.pgn, { strict: false })
  } catch {
    return null
  }

  const headers = parsed.getHeaders()
  const moves = parsed.history({ verbose: true })
  if (moves.length < 4) return null

  let replay: Chess
  try {
    replay = new Chess(moves[0]?.before)
  } catch {
    replay = new Chess()
  }

  const boundaries: BoundarySnapshot[] = []
  const developedMinors = new Set<string>()
  const movedCenterPawns = new Set<string>()
  const minorStarts = userColor === "w" ? new Set(["b1", "g1"]) : new Set(["b8", "g8"])
  const centerPawnStarts = userColor === "w" ? new Set(["d2", "e2"]) : new Set(["d7", "e7"])
  let pendingLoose = new Set<Square>()
  let pendingBaselineBalance: number | null = null
  let userMoves = 0
  let castled = false
  let castledByMoveTen = false
  let hangingLosses = 0
  const forkMoves: number[] = []
  const linePressureMoves: number[] = []
  let reachedEndgame = false
  let lastMove: Move | null = null
  let lastUserDecision: UserDecision | null = null
  const trainingPositions: TrainingPosition[] = []
  const opening = openingName(game, headers)

  moves.forEach((sourceMove, index) => {
    const balanceBeforeMove = boardMaterial(replay, userColor).balance
    const fenBeforeMove = replay.fen()
    let move: Move
    try {
      move = replay.move({
        from: sourceMove.from,
        to: sourceMove.to,
        ...(sourceMove.promotion ? { promotion: sourceMove.promotion } : {}),
      })
    } catch {
      return
    }

    lastMove = move
    const fullMove = Math.floor(index / 2) + 1

    if (move.color === userColor) {
      userMoves += 1
      if (move.isKingsideCastle() || move.isQueensideCastle()) {
        castled = true
        if (fullMove <= 10) castledByMoveTen = true
      }
      if (fullMove <= 10 && minorStarts.has(move.from)) developedMinors.add(move.from)
      if (fullMove <= 10 && centerPawnStarts.has(move.from)) movedCenterPawns.add(move.from)
      pendingLoose = loosePieceSquares(replay, userColor)
      pendingBaselineBalance = balanceBeforeMove
      lastUserDecision = {
        fen: fenBeforeMove,
        moveNumber: fullMove,
        playedMove: move.san,
      }
    } else {
      const balanceAfterMove = boardMaterial(replay, userColor).balance
      const likelyHangingLoss =
        move.isCapture() &&
        Boolean(move.captured) &&
        PIECE_VALUES[move.captured as PieceSymbol] >= 3 &&
        pendingLoose.has(move.to) &&
        pendingBaselineBalance !== null &&
        balanceAfterMove <= pendingBaselineBalance - 2
      if (likelyHangingLoss) {
        hangingLosses += 1
      }
      const fork = createsFork(replay, move, userColor)
      const linePressure = createsLinePressure(replay, move, userColor)
      if (fork) forkMoves.push(fullMove)
      if (linePressure) linePressureMoves.push(fullMove)

      const materialSwing =
        pendingBaselineBalance === null
          ? 0
          : Math.max(0, pendingBaselineBalance - balanceAfterMove)
      const category: TrainingPositionCategory | null = likelyHangingLoss
        ? "Loose piece"
        : fork
          ? "Fork or double attack"
          : linePressure
            ? "Pin, skewer or x-ray"
            : replay.isCheckmate()
              ? "Mating threat"
              : materialSwing >= 2
                ? "Material swing"
                : null

      if (category && lastUserDecision && trainingPositions.length < 2) {
        const reasons: Record<TrainingPositionCategory, string> = {
          "Loose piece": "Your opponent immediately captured an undefended minor or major piece.",
          "Fork or double attack": "The reply attacked at least two valuable targets at once.",
          "Pin, skewer or x-ray": "The reply created pressure through a bishop, rook or queen line.",
          "Mating threat": "The reply ended the game with checkmate.",
          "Material swing": "The full move ended with a material loss of at least two points.",
        }
        trainingPositions.push({
          id: `${game.url}#${lastUserDecision.moveNumber}-${lastUserDecision.playedMove}`,
          fen: lastUserDecision.fen,
          gameUrl: game.url,
          opponent: opponent.username,
          opening,
          color: isWhite ? "White" : "Black",
          moveNumber: lastUserDecision.moveNumber,
          playedMove: lastUserDecision.playedMove,
          opponentReply: move.san,
          category,
          reason: reasons[category],
          materialSwing,
        })
      }
      pendingLoose = new Set<Square>()
      pendingBaselineBalance = null
      lastUserDecision = null
    }

    if (isEndgame(replay)) reachedEndgame = true

    if (move.color === "b") {
      const material = boardMaterial(replay, userColor)
      boundaries.push({
        move: fullMove,
        balance: material.balance,
        totalMaterial: material.total,
      })
    }
  })

  const finalFullMove = Math.ceil(moves.length / 2)
  if (moves.at(-1)?.color === "w") {
    const material = boardMaterial(replay, userColor)
    boundaries.push({
      move: finalFullMove,
      balance: material.balance,
      totalMaterial: material.total,
    })
  }

  const openingSnapshot = boundaries.find((snapshot) => snapshot.move >= 10)
  const drops = persistentMaterialDrops(boundaries)
  const exposureLedToDrop = (moveNumbers: number[], window: number) =>
    moveNumbers.filter((moveNumber) =>
      drops.moves.some(
        (dropMove) => dropMove >= moveNumber && dropMove <= moveNumber + window,
      ),
    ).length
  const maxAdvantage = Math.max(0, ...boundaries.map((snapshot) => snapshot.balance))
  const maxDeficit = Math.min(0, ...boundaries.map((snapshot) => snapshot.balance))
  const openingEligible = Boolean(openingSnapshot)
  const developmentScore = openingEligible
    ? clamp(
        developedMinors.size * 25 +
          movedCenterPawns.size * 10 +
          (castledByMoveTen ? 30 : 0),
      )
    : null
  const castlingEligible = userMoves >= 8
  const checkmateLoss = result === "loss" && replay.isCheckmate()
  const accuracy = isWhite ? game.accuracies?.white : game.accuracies?.black

  return {
    summary: {
      url: game.url,
      opponent: opponent.username,
      opponentRating: opponent.rating,
      userRating: player.rating,
      color: isWhite ? "White" : "Black",
      outcome: result,
      timeClass: titleCase(game.time_class),
      timeControl: game.time_control,
      opening,
      accuracy: typeof accuracy === "number" ? accuracy : null,
      endTime: game.end_time,
      plies: moves.length,
    },
    outcome: result,
    score: outcomeScore(result),
    openingEligible,
    openingClean: Boolean(openingSnapshot && openingSnapshot.balance >= -1),
    openingDeficit: Boolean(openingSnapshot && openingSnapshot.balance <= -2),
    developmentScore,
    middlegameEligible: finalFullMove >= 16,
    middlegameDrops: drops.middlegame,
    reachedEndgame,
    castlingEligible,
    castled,
    hangingLosses,
    forkExposures: Math.min(2, exposureLedToDrop(forkMoves, 2)),
    linePressureExposures: Math.min(2, exposureLedToDrop(linePressureMoves, 3)),
    checkmateLoss,
    backRankLoss: checkmateLoss && isBackRankMate(replay, userColor, lastMove),
    timeoutLoss: result === "loss" && player.result === "timeout",
    advantageChance: maxAdvantage >= 3,
    convertedAdvantage: maxAdvantage >= 3 && result === "win",
    deficitGame: maxDeficit <= -3,
    savedDeficit: maxDeficit <= -3 && result !== "loss",
    trainingPositions,
  }
}

function summarizeRecord(games: GameDiagnostic[]): RecordSummary {
  const wins = games.filter((game) => game.outcome === "win").length
  const draws = games.filter((game) => game.outcome === "draw").length
  const losses = games.length - wins - draws
  return {
    games: games.length,
    wins,
    draws,
    losses,
    scorePct: games.length ? percent(((wins + draws * 0.5) / games.length) * 100) : 0,
  }
}

function splitSummary(
  games: GameDiagnostic[],
  labels: string[],
  getLabel: (game: GameDiagnostic) => string,
): SplitSummary[] {
  return labels.flatMap((label) => {
    const matching = games.filter((game) => getLabel(game) === label)
    return matching.length ? [{ label, ...summarizeRecord(matching) }] : []
  })
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

function buildOpenings(games: GameDiagnostic[]): OpeningSummary[] {
  const grouped = new Map<string, GameDiagnostic[]>()

  for (const game of games) {
    const group = grouped.get(game.summary.opening) ?? []
    group.push(game)
    grouped.set(game.summary.opening, group)
  }

  return [...grouped.entries()]
    .map(([name, openingGames]) => ({ name, ...summarizeRecord(openingGames) }))
    .sort((a, b) => b.games - a.games || b.scorePct - a.scorePct)
    .slice(0, 6)
}

function topFindings(candidates: RankedFinding[], limit = 3) {
  const seen = new Set<string>()
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((candidate) => {
      if (seen.has(candidate.key)) return false
      seen.add(candidate.key)
      return true
    })
    .slice(0, limit)
    .map(({ title, value, detail, score }) => ({ title, value, detail, score }))
}

function buildStrengths(
  games: GameDiagnostic[],
  record: RecordSummary,
  byColor: SplitSummary[],
  metrics: DiagnosticMetrics,
) {
  const candidates: RankedFinding[] = []
  const bestColor = [...byColor].sort((a, b) => b.scorePct - a.scorePct)[0]

  candidates.push({
    key: "results",
    title: "Results baseline",
    value: `${record.scorePct}% score`,
    detail: `${record.wins} wins, ${record.draws} draws and ${record.losses} losses in this sample.`,
    score: record.scorePct,
  })

  if (bestColor && bestColor.games >= 3) {
    candidates.push({
      key: "color",
      title: `${bestColor.label} pieces`,
      value: `${bestColor.scorePct}% score`,
      detail: `Your better-performing color across ${bestColor.games} games.`,
      score: bestColor.scorePct + Math.min(8, bestColor.games / 2),
    })
  }

  if (metrics.cleanOpeningRate !== null) {
    candidates.push({
      key: "opening",
      title: "Opening stability",
      value: `${Math.round(metrics.cleanOpeningRate)}% clean`,
      detail: `Reached move 10 no worse than one pawn down in ${metrics.openingSample} eligible games.`,
      score: metrics.cleanOpeningRate,
    })
  }

  if (metrics.middlegameStability !== null) {
    candidates.push({
      key: "middle",
      title: "Middlegame control",
      value: `${Math.round(metrics.middlegameStability)}% stable`,
      detail: `Avoided a persistent 2+ point material drop from moves 11–30.`,
      score: metrics.middlegameStability,
    })
  }

  if (metrics.endgameScore !== null && metrics.endgameSample >= 3) {
    candidates.push({
      key: "endgame",
      title: "Endgame results",
      value: `${Math.round(metrics.endgameScore)}% score`,
      detail: `Performance in the ${metrics.endgameSample} games that reached an endgame.`,
      score: metrics.endgameScore + Math.min(5, metrics.endgameSample),
    })
  }

  if (metrics.advantageChances >= 2) {
    const conversion = (metrics.convertedAdvantages / metrics.advantageChances) * 100
    candidates.push({
      key: "conversion",
      title: "Advantage conversion",
      value: `${Math.round(conversion)}% converted`,
      detail: `Won ${metrics.convertedAdvantages} of ${metrics.advantageChances} games after going 3+ points ahead.`,
      score: conversion,
    })
  }

  if (metrics.deficitGames >= 2) {
    const saveRate = (metrics.savedDeficits / metrics.deficitGames) * 100
    candidates.push({
      key: "resilience",
      title: "Resilience",
      value: `${Math.round(saveRate)}% saved`,
      detail: `Avoided defeat in ${metrics.savedDeficits} of ${metrics.deficitGames} games after falling 3+ points behind.`,
      score: 48 + saveRate / 2,
    })
  }

  if (metrics.averageAccuracy !== null && metrics.accuracySample >= 3) {
    candidates.push({
      key: "accuracy",
      title: "Reviewed-game accuracy",
      value: `${metrics.averageAccuracy.toFixed(1)} average`,
      detail: `Platform-provided accuracy was available for ${metrics.accuracySample} games.`,
      score: metrics.averageAccuracy,
    })
  }

  const looseRate = games.length ? metrics.hangingLosses / games.length : 0
  candidates.push({
    key: "material",
    title: "Piece safety",
    value: looseRate < 0.1 ? "Very steady" : `${looseRate.toFixed(2)} slips/game`,
    detail: `${metrics.hangingLosses} likely undefended minor-or-major piece losses detected.`,
    score: 92 - clamp(looseRate * 120),
  })

  return topFindings(candidates)
}

function buildWeaknesses(games: GameDiagnostic[], metrics: DiagnosticMetrics) {
  const total = Math.max(1, games.length)
  const candidates: RankedFinding[] = []

  candidates.push({
    key: "loose",
    title: "Loose-piece awareness",
    value: `${metrics.hangingLosses} likely slips`,
    detail: "Undefended minor or major pieces were captured on the opponent’s next move.",
    score: clamp((metrics.hangingLosses / total) * 180),
  })
  candidates.push({
    key: "forks",
    title: "Fork recognition",
    value: `${metrics.forkExposures} pressure moments`,
    detail: "An opponent move attacked two valuable targets at the same time.",
    score: clamp((metrics.forkExposures / total) * 150),
  })
  candidates.push({
    key: "lines",
    title: "Pins and skewers",
    value: `${metrics.linePressureExposures} line-ups`,
    detail: "Two valuable pieces lined up behind one another against a bishop, rook or queen.",
    score: clamp((metrics.linePressureExposures / total) * 120),
  })

  if (metrics.cleanOpeningRate !== null) {
    candidates.push({
      key: "opening",
      title: "Early material balance",
      value: `${Math.round(100 - metrics.cleanOpeningRate)}% shaky`,
      detail: "Games where you reached move 10 already down at least two points drive this signal.",
      score: 100 - metrics.cleanOpeningRate,
    })
  }

  if (metrics.middlegameStability !== null) {
    candidates.push({
      key: "middle",
      title: "Middlegame blunder checks",
      value: `${Math.round(100 - metrics.middlegameStability)}% had a drop`,
      detail: "Persistent 2+ point material swings between moves 11 and 30 suggest missed threats.",
      score: 100 - metrics.middlegameStability,
    })
  }

  if (metrics.castleRate !== null) {
    candidates.push({
      key: "king",
      title: "King safety",
      value: `${Math.round(metrics.castleRate)}% castled`,
      detail: `Castling was detected in ${Math.round(metrics.castleRate)}% of ${metrics.castleSample} eligible games.`,
      score: (100 - metrics.castleRate) * 0.7 + (metrics.checkmateLosses / total) * 35,
    })
  }

  if (metrics.advantageChances >= 2) {
    const missed = metrics.advantageChances - metrics.convertedAdvantages
    const missedRate = (missed / metrics.advantageChances) * 100
    candidates.push({
      key: "conversion",
      title: "Converting an edge",
      value: `${missed} of ${metrics.advantageChances} slipped`,
      detail: "A material lead of at least three points did not become a win.",
      score: missedRate,
    })
  }

  if (metrics.endgameScore !== null && metrics.endgameSample >= 3) {
    candidates.push({
      key: "endgame",
      title: "Endgame technique",
      value: `${Math.round(metrics.endgameScore)}% score`,
      detail: `Result score in ${metrics.endgameSample} games that reached reduced material.`,
      score: 100 - metrics.endgameScore,
    })
  }

  if (metrics.timeoutLosses > 0) {
    candidates.push({
      key: "clock",
      title: "Clock pressure",
      value: `${metrics.timeoutLosses} timeout losses`,
      detail: "Faster pattern recognition may help preserve time for critical positions.",
      score: 35 + clamp((metrics.timeoutLosses / total) * 160),
    })
  }

  return topFindings(candidates)
}

function buildRecommendations(games: GameDiagnostic[], metrics: DiagnosticMetrics) {
  const total = Math.max(1, games.length)
  const conversionRate = metrics.advantageChances
    ? (metrics.convertedAdvantages / metrics.advantageChances) * 100
    : 60
  const recommendations: RankedRecommendation[] = [
    {
      key: "loose",
      category: "Loose & Hanging Pieces",
      reason: "Practice a safety scan before every move: checks, captures, threats, then undefended pieces.",
      practice: "10 themed puzzles · 3× per week",
      signal: `${metrics.hangingLosses} likely loose-piece losses`,
      lichessTheme: "hangingPiece",
      score: 28 + (metrics.hangingLosses / total) * 180,
    },
    {
      key: "forks",
      category: "Forks & Double Attacks",
      reason: "Train yourself to map every knight, pawn and queen attack after the opponent moves.",
      practice: "8 slow puzzles · name both targets",
      signal: `${metrics.forkExposures} double-attack signals`,
      lichessTheme: "fork",
      score: 26 + (metrics.forkExposures / total) * 155,
    },
    {
      key: "lines",
      category: "Pins, Skewers & X-Rays",
      reason: "Look through every bishop, rook and queen line before moving a blocker or high-value piece.",
      practice: "8 themed puzzles · calculate 2 moves deep",
      signal: `${metrics.linePressureExposures} vulnerable line-ups`,
      lichessTheme: "pin",
      score: 24 + (metrics.linePressureExposures / total) * 125,
    },
    {
      key: "defense",
      category: "Defensive Moves",
      reason: "Pause on every forcing move and find the opponent’s best reply before committing.",
      practice: "10 puzzles · no guessing",
      signal:
        metrics.middlegameStability === null
          ? "Build a broader defensive sample"
          : `${Math.round(100 - metrics.middlegameStability)}% of middlegames had a material drop`,
      lichessTheme: "defensiveMove",
      score: 30 + (100 - (metrics.middlegameStability ?? 70)) * 0.9,
    },
    {
      key: "mate",
      category: metrics.backRankLosses ? "Back-Rank Tactics" : "Checkmate Patterns",
      reason: "Recognize mating geometry earlier—both when attacking and when creating an escape square.",
      practice: "Mate-in-1/2 sets · 5 minutes daily",
      signal: `${metrics.checkmateLosses} checkmate losses${
        metrics.backRankLosses ? ` · ${metrics.backRankLosses} on the back rank` : ""
      }`,
      lichessTheme: metrics.backRankLosses ? "backRankMate" : "mate",
      score: 24 + (metrics.checkmateLosses / total) * 105 + metrics.backRankLosses * 18,
    },
    {
      key: "conversion",
      category: "Winning Material",
      reason: "When ahead, compare forcing continuations and simplify only when the resulting position stays safe.",
      practice: "8 puzzles · calculate through the trade",
      signal: metrics.advantageChances
        ? `${metrics.advantageChances - metrics.convertedAdvantages} advantages not converted`
        : "Build the habit before the next winning position",
      lichessTheme: "advantage",
      score: 22 + (100 - conversionRate) * 0.7,
    },
    {
      key: "endgame",
      category: "Endgame Tactics",
      reason: "Reduced-material puzzles sharpen passed-pawn races, promotion ideas and precise calculation.",
      practice: "6 endgame puzzles · replay misses",
      signal:
        metrics.endgameScore === null
          ? "Not enough endgames for a firm read"
          : `${Math.round(metrics.endgameScore)}% score across ${metrics.endgameSample} endgames`,
      lichessTheme: "endgame",
      score: 23 + (100 - (metrics.endgameScore ?? 55)) * 0.65,
    },
    {
      key: "speed",
      category: "Mixed Pattern Speed",
      reason: "Short mixed sets improve recognition without replacing slower calculation practice.",
      practice: "Puzzle Rush Survival · 1× per week",
      signal: `${metrics.timeoutLosses} timeout losses in the sample`,
      lichessTheme: "short",
      score: 18 + (metrics.timeoutLosses / total) * 180,
    },
  ]

  const seen = new Set<string>()
  return recommendations
    .sort((a, b) => b.score - a.score)
    .filter((recommendation) => {
      if (seen.has(recommendation.key)) return false
      seen.add(recommendation.key)
      return true
    })
    .slice(0, 3)
    .map(({ category, reason, practice, signal, lichessTheme, score }) => ({
      category,
      reason,
      practice,
      signal,
      lichessTheme,
      score,
    }))
}

export function analyzeGames(
  username: string,
  games: ChessGame[],
  requestedGames: number,
  platform: ChessPlatform = "chesscom",
): AnalysisReport {
  const diagnostics = games
    .map((game) => parseGame(game, username))
    .filter((game): game is GameDiagnostic => Boolean(game))

  if (diagnostics.length === 0) {
    throw new Error("The games were downloaded, but none contained usable standard-chess move data.")
  }

  const record = summarizeRecord(diagnostics)
  const byColor = splitSummary(diagnostics, ["White", "Black"], (game) => game.summary.color)
  const byTimeClass = splitSummary(
    diagnostics,
    ["Ultra Bullet", "Bullet", "Blitz", "Rapid", "Classical", "Correspondence", "Daily"],
    (game) => game.summary.timeClass,
  )
  const openingGames = diagnostics.filter((game) => game.openingEligible)
  const middlegames = diagnostics.filter((game) => game.middlegameEligible)
  const endgames = diagnostics.filter((game) => game.reachedEndgame)
  const castlingGames = diagnostics.filter((game) => game.castlingEligible)
  const accuracyGames = diagnostics.filter((game) => game.summary.accuracy !== null)
  const advantageGames = diagnostics.filter((game) => game.advantageChance)
  const deficitGames = diagnostics.filter((game) => game.deficitGame)
  const averageAccuracy = average(
    accuracyGames.map((game) => game.summary.accuracy as number),
  )

  const metrics: DiagnosticMetrics = {
    cleanOpeningRate: openingGames.length
      ? percent((openingGames.filter((game) => game.openingClean).length / openingGames.length) * 100)
      : null,
    openingSample: openingGames.length,
    developmentScore: (() => {
      const value = average(
        openingGames.flatMap((game) =>
          game.developmentScore === null ? [] : [game.developmentScore],
        ),
      )
      return value === null ? null : percent(value)
    })(),
    middlegameStability: middlegames.length
      ? percent(
          (middlegames.filter((game) => game.middlegameDrops === 0).length /
            middlegames.length) *
            100,
        )
      : null,
    middlegameSample: middlegames.length,
    endgameScore: endgames.length
      ? percent((endgames.reduce((sum, game) => sum + game.score, 0) / endgames.length) * 100)
      : null,
    endgameSample: endgames.length,
    castleRate: castlingGames.length
      ? percent((castlingGames.filter((game) => game.castled).length / castlingGames.length) * 100)
      : null,
    castleSample: castlingGames.length,
    hangingLosses: diagnostics.reduce((sum, game) => sum + game.hangingLosses, 0),
    forkExposures: diagnostics.reduce((sum, game) => sum + game.forkExposures, 0),
    linePressureExposures: diagnostics.reduce(
      (sum, game) => sum + game.linePressureExposures,
      0,
    ),
    checkmateLosses: diagnostics.filter((game) => game.checkmateLoss).length,
    backRankLosses: diagnostics.filter((game) => game.backRankLoss).length,
    timeoutLosses: diagnostics.filter((game) => game.timeoutLoss).length,
    advantageChances: advantageGames.length,
    convertedAdvantages: advantageGames.filter((game) => game.convertedAdvantage).length,
    deficitGames: deficitGames.length,
    savedDeficits: deficitGames.filter((game) => game.savedDeficit).length,
    averageAccuracy: averageAccuracy === null ? null : percent(averageAccuracy),
    accuracySample: accuracyGames.length,
  }

  const oldest = Math.min(...diagnostics.map((game) => game.summary.endTime))
  const newest = Math.max(...diagnostics.map((game) => game.summary.endTime))
  const averageRating = average(diagnostics.map((game) => game.summary.userRating)) ?? 0
  const averageOpponentRating =
    average(diagnostics.map((game) => game.summary.opponentRating)) ?? 0

  return {
    platform,
    username,
    requestedGames,
    gamesAnalyzed: diagnostics.length,
    gamesSkipped: games.length - diagnostics.length,
    dateFrom: oldest,
    dateTo: newest,
    confidence:
      diagnostics.length >= 40 ? "High" : diagnostics.length >= 15 ? "Medium" : "Early read",
    record,
    byColor,
    byTimeClass,
    averageRating: Math.round(averageRating),
    averageOpponentRating: Math.round(averageOpponentRating),
    strengths: buildStrengths(diagnostics, record, byColor, metrics),
    weaknesses: buildWeaknesses(diagnostics, metrics),
    recommendations: buildRecommendations(diagnostics, metrics),
    phases: [
      {
        phase: "Opening",
        value: metrics.cleanOpeningRate,
        display:
          metrics.cleanOpeningRate === null
            ? "Not enough data"
            : `${Math.round(metrics.cleanOpeningRate)}% clean`,
        detail: "At least equal within one material point after move 10",
        sample: metrics.openingSample,
      },
      {
        phase: "Middlegame",
        value: metrics.middlegameStability,
        display:
          metrics.middlegameStability === null
            ? "Not enough data"
            : `${Math.round(metrics.middlegameStability)}% stable`,
        detail: "No persistent 2+ point material drop from moves 11–30",
        sample: metrics.middlegameSample,
      },
      {
        phase: "Endgame",
        value: metrics.endgameScore,
        display:
          metrics.endgameScore === null
            ? "Not enough data"
            : `${Math.round(metrics.endgameScore)}% score`,
        detail: "Result score in games that reached reduced material",
        sample: metrics.endgameSample,
      },
    ],
    openings: buildOpenings(diagnostics),
    recentGames: diagnostics
      .map((game) => game.summary)
      .sort((a, b) => b.endTime - a.endTime)
      .slice(0, 8),
    trainingPositions: diagnostics
      .flatMap((game) => game.trainingPositions)
      .sort((a, b) => b.materialSwing - a.materialSwing || a.moveNumber - b.moveNumber)
      .slice(0, 12),
    metrics,
  }
}
