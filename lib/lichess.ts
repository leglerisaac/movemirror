import { Chess } from "chess.js"

import type {
  ChessGame,
  FetchGamesResult,
  FetchProgress,
  GameFilter,
  GamePlayer,
  PlayerProfile,
  TimeClass,
} from "./types"

const API_ROOT = "https://lichess.org/api"
const SITE_ROOT = "https://lichess.org"

interface LichessGameSide {
  user?: {
    id: string
    name: string
    title?: string
  }
  rating?: number
  analysis?: {
    accuracy?: number
  }
}

interface LichessGameResponse {
  id: string
  rated: boolean
  variant: string
  speed: string
  perf: string
  createdAt: number
  lastMoveAt: number
  status: string
  winner?: "white" | "black"
  players: {
    white: LichessGameSide
    black: LichessGameSide
  }
  opening?: {
    eco: string
    name: string
  }
  moves?: string
  pgn?: string
  daysPerTurn?: number
  clock?: {
    initial: number
    increment: number
  }
}

export class LichessApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "LichessApiError"
    this.status = status
  }
}

function abortError() {
  return new DOMException("The analysis was cancelled.", "AbortError")
}

async function request(url: string, accept: string, signal?: AbortSignal) {
  let response: Response

  try {
    response = await fetch(url, {
      headers: { Accept: accept },
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw abortError()
    throw new LichessApiError(
      error instanceof Error ? error.message : "Unable to reach Lichess right now.",
    )
  }

  if (response.status === 404 || response.status === 410) {
    throw new LichessApiError("That Lichess username could not be found.", response.status)
  }
  if (response.status === 429) {
    throw new LichessApiError(
      "Lichess is rate-limiting requests. Wait one minute and try again.",
      429,
    )
  }
  if (!response.ok) {
    throw new LichessApiError(`Lichess returned an error (${response.status}).`, response.status)
  }

  return response
}

function pgnFromMoves(moves: string | undefined) {
  if (!moves?.trim()) return ""

  const chess = new Chess()
  try {
    for (const move of moves.trim().split(/\s+/)) chess.move(move)
    return chess.pgn()
  } catch {
    return ""
  }
}

function drawResult(status: string) {
  if (status === "stalemate") return "stalemate"
  if (status === "outoftime" || status === "timeout") return "timevsinsufficient"
  if (status === "insufficientMaterialClaim") return "insufficient"
  return "agreed"
}

function playerResult(
  game: LichessGameResponse,
  color: "white" | "black",
) {
  if (!game.winner) return drawResult(game.status)
  if (game.winner === color) return "win"
  if (game.status === "outoftime" || game.status === "timeout") return "timeout"
  return game.status === "mate" ? "checkmated" : "resigned"
}

function gamePlayer(
  game: LichessGameResponse,
  color: "white" | "black",
): GamePlayer | null {
  const side = game.players[color]
  if (!side.user?.name || typeof side.rating !== "number") return null
  return {
    username: side.user.name,
    rating: side.rating,
    result: playerResult(game, color),
  }
}

function timeClass(game: LichessGameResponse): TimeClass | null {
  const value = game.speed
  if (
    value === "ultraBullet" ||
    value === "bullet" ||
    value === "blitz" ||
    value === "rapid" ||
    value === "classical" ||
    value === "correspondence"
  ) {
    return value
  }
  return null
}

function timeControl(game: LichessGameResponse) {
  if (game.clock) return `${game.clock.initial}+${game.clock.increment}`
  if (game.daysPerTurn) return `1/${game.daysPerTurn * 86400}`
  return "—"
}

function normalizeGame(game: LichessGameResponse): ChessGame | null {
  if (game.variant !== "standard") return null
  const speed = timeClass(game)
  const white = gamePlayer(game, "white")
  const black = gamePlayer(game, "black")
  const pgn = game.pgn?.trim() || pgnFromMoves(game.moves)
  if (!speed || !white || !black || !pgn) return null

  return {
    url: `${SITE_ROOT}/${game.id}`,
    pgn,
    rated: game.rated,
    end_time: Math.round(game.lastMoveAt / 1000),
    time_control: timeControl(game),
    time_class: speed,
    rules: "chess",
    white,
    black,
    accuracies: {
      white: game.players.white.analysis?.accuracy,
      black: game.players.black.analysis?.accuracy,
    },
    eco: game.opening?.name ?? game.opening?.eco,
  }
}

function profileFromGames(
  username: string,
  games: LichessGameResponse[],
): PlayerProfile {
  const normalized = username.toLowerCase()
  const account = games
    .flatMap((game) => [game.players.white.user, game.players.black.user])
    .find(
      (user) =>
        user?.id.toLowerCase() === normalized ||
        user?.name.toLowerCase() === normalized,
    )
  const canonicalUsername = account?.name ?? username

  return {
    platform: "lichess",
    username: canonicalUsername,
    url: `${SITE_ROOT}/@/${encodeURIComponent(canonicalUsername)}`,
    title: account?.title,
  }
}

function perfType(filter: GameFilter) {
  if (filter === "all") return null
  if (filter === "daily") return "correspondence"
  return filter
}

export function normalizeLichessUsername(input: string) {
  const trimmed = input.trim()
  const fromUrl = trimmed.match(/lichess\.org\/@\/([^/?#]+)/i)?.[1]
  return decodeURIComponent(fromUrl ?? trimmed).replace(/^@/, "").trim()
}

export function validateLichessUsername(username: string) {
  return /^[a-zA-Z0-9_-]{2,30}$/.test(username)
}

export async function fetchRecentLichessGames({
  username,
  count,
  filter,
  signal,
  onProgress,
}: {
  username: string
  count: number
  filter: GameFilter
  signal?: AbortSignal
  onProgress?: (progress: FetchProgress) => void
}): Promise<FetchGamesResult> {
  const encodedUsername = encodeURIComponent(username)

  onProgress?.({
    stage: "profile",
    label: "Finding the Lichess account…",
    percent: 6,
  })
  onProgress?.({
    stage: "archives",
    label: "Preparing the Lichess game export…",
    percent: 16,
  })

  const params = new URLSearchParams({
    max: String(Math.min(300, Math.max(count, count * 3))),
    moves: "true",
    pgnInJson: "true",
    tags: "true",
    clocks: "false",
    evals: "false",
    accuracy: "true",
    opening: "true",
    sort: "dateDesc",
  })
  const requestedPerf = perfType(filter)
  if (requestedPerf) params.set("perfType", requestedPerf)

  onProgress?.({
    stage: "games",
    label: "Downloading recent Lichess games…",
    percent: 28,
  })
  const response = await request(
    `${API_ROOT}/games/user/${encodedUsername}?${params}`,
    "application/x-ndjson",
    signal,
  )
  const body = await response.text()
  if (signal?.aborted) throw abortError()

  const exportedGames = body
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LichessGameResponse]
      } catch {
        return []
      }
    })
  const games = exportedGames
    .map(normalizeGame)
    .filter((game): game is ChessGame => Boolean(game))
    .sort((a, b) => b.end_time - a.end_time)
    .slice(0, count)

  if (games.length === 0) {
    const filterLabel = filter === "all" ? "standard" : filter
    throw new LichessApiError(
      `No completed ${filterLabel} games between registered players were found for this Lichess account.`,
    )
  }

  const profile = profileFromGames(username, exportedGames)

  onProgress?.({
    stage: "games",
    label: `Loaded ${games.length} recent Lichess games`,
    percent: 68,
  })

  return {
    profile,
    games,
    sourcesScanned: exportedGames.length,
  }
}
