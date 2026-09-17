import type {
  ChessGame,
  FetchGamesResult,
  FetchProgress,
  GameFilter,
  PlayerProfile,
} from "./types"

const API_ROOT = "https://api.chess.com/pub"
const MAX_ARCHIVES_TO_SCAN = 120

interface ArchiveIndex {
  archives: string[]
}

interface GameArchive {
  games: ChessGame[]
}

export class ChessComApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "ChessComApiError"
    this.status = status
  }
}

function abortError() {
  return new DOMException("The analysis was cancelled.", "AbortError")
}

function wait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }

    const timeout = globalThis.setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timeout)
        reject(abortError())
      },
      { once: true },
    )
  })
}

function jsonp<T>(url: string, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new ChessComApiError("The Chess.com API is unavailable here."))
      return
    }

    if (signal?.aborted) {
      reject(abortError())
      return
    }

    const callbackName = `moveMirror_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`
    const script = document.createElement("script")
    const separator = url.includes("?") ? "&" : "?"
    let settled = false

    const cleanUp = () => {
      script.remove()
      delete (window as unknown as Record<string, unknown>)[callbackName]
      signal?.removeEventListener("abort", onAbort)
    }

    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      cleanUp()
      action()
    }

    const onAbort = () => finish(() => reject(abortError()))

    ;(window as unknown as Record<string, unknown>)[callbackName] = (
      payload: T & { message?: string },
    ) => {
      const message = payload?.message
      if (message && !("games" in (payload as object))) {
        finish(() => reject(new ChessComApiError(message)))
        return
      }
      finish(() => resolve(payload))
    }

    script.async = true
    script.src = `${url}${separator}callback=${callbackName}`
    script.onerror = () =>
      finish(() =>
        reject(
          new ChessComApiError(
            "Chess.com did not return data. Check the username and try again.",
          ),
        ),
      )

    signal?.addEventListener("abort", onAbort, { once: true })
    document.head.appendChild(script)
  })
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let fetchFailure: unknown
  const headers: Record<string, string> = { Accept: "application/json" }
  if (typeof window === "undefined") {
    headers["User-Agent"] = "MoveMirror/1.0 (+https://chess.leglord.com)"
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers,
        signal,
      })

      if (response.status === 429 && attempt < 2) {
        await wait(900 * (attempt + 1), signal)
        continue
      }

      if (!response.ok) {
        if (response.status === 404 || response.status === 410) {
          throw new ChessComApiError(
            "That Chess.com username could not be found.",
            response.status,
          )
        }
        if (response.status === 429) {
          throw new ChessComApiError(
            "Chess.com is rate-limiting requests. Wait a moment and try again.",
            429,
          )
        }
        throw new ChessComApiError(
          `Chess.com returned an error (${response.status}).`,
          response.status,
        )
      }

      return (await response.json()) as T
    } catch (error) {
      if (error instanceof ChessComApiError || signal?.aborted) throw error
      fetchFailure = error
      break
    }
  }

  try {
    return await jsonp<T>(url, signal)
  } catch (jsonpFailure) {
    if (signal?.aborted) throw abortError()
    if (jsonpFailure instanceof ChessComApiError) throw jsonpFailure
    throw new ChessComApiError(
      fetchFailure instanceof Error
        ? fetchFailure.message
        : "Unable to reach Chess.com right now.",
    )
  }
}

export function normalizeUsername(input: string) {
  const trimmed = input.trim()
  const fromUrl = trimmed.match(/chess\.com\/(?:member|player)\/([^/?#]+)/i)?.[1]
  return decodeURIComponent(fromUrl ?? trimmed).replace(/^@/, "").trim()
}

export function validateUsername(username: string) {
  return /^[a-zA-Z0-9_-]{2,30}$/.test(username)
}

export async function fetchRecentGames({
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
  const encodedUsername = encodeURIComponent(username.toLowerCase())

  onProgress?.({
    stage: "profile",
    label: "Finding the player profile…",
    percent: 6,
  })
  const profileResponse = await requestJson<Omit<PlayerProfile, "platform">>(
    `${API_ROOT}/player/${encodedUsername}`,
    signal,
  )
  const profile: PlayerProfile = { ...profileResponse, platform: "chesscom" }

  onProgress?.({
    stage: "archives",
    label: "Checking available game archives…",
    percent: 14,
  })
  const archiveIndex = await requestJson<ArchiveIndex>(
    `${API_ROOT}/player/${encodedUsername}/games/archives`,
    signal,
  )

  const archiveUrls = [...(archiveIndex.archives ?? [])]
    .reverse()
    .slice(0, MAX_ARCHIVES_TO_SCAN)
  const matchingGames: ChessGame[] = []
  let monthsScanned = 0

  for (const archiveUrl of archiveUrls) {
    if (signal?.aborted) throw abortError()

    onProgress?.({
      stage: "games",
      label: `Loading recent games · ${matchingGames.length}/${count} found`,
      percent: Math.min(68, 18 + Math.round((matchingGames.length / count) * 50)),
    })

    const archive = await requestJson<GameArchive>(archiveUrl, signal)
    monthsScanned += 1

    const games = (archive.games ?? []).filter(
      (game) =>
        game.rules === "chess" &&
        Boolean(game.pgn) &&
        Boolean(game.white?.username) &&
        Boolean(game.black?.username) &&
        (filter === "all" || game.time_class === filter),
    )
    matchingGames.push(...games)

    if (matchingGames.length >= count) break
  }

  const games = matchingGames
    .sort((a, b) => b.end_time - a.end_time)
    .slice(0, count)

  if (games.length === 0) {
    const filterLabel = filter === "all" ? "standard" : filter
    throw new ChessComApiError(
      `No completed ${filterLabel} chess games were found for this player.`,
    )
  }

  return {
    profile,
    games,
    sourcesScanned: monthsScanned,
  }
}
