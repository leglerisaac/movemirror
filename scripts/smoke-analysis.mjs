import { createServer } from "vite"

const chessComUsername = "MoveMirrorTest"
const lichessUsername = "MoveMirrorTest"
const basePgn = `[Event "MoveMirror smoke test"]
[Site "https://example.com/game"]
[Date "2026.09.01"]
[Round "-"]
[White "MoveMirrorTest"]
[Black "PracticePartner"]
[Result "1-0"]
[ECO "C50"]
[Opening "Italian Game"]
[TimeControl "600+5"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d3 O-O 6. Nc3 d6 7. Be3 Be6 8. Qd2 Qd7 9. Rad1 Rad8 10. h3 h6 11. a3 a6 12. b4 Ba7 13. Bxa7 Nxa7 14. Qe3 Nc6 15. Nd5 Bxd5 16. exd5 Ne7 17. d4 e4 18. Nd2 Nexd5 19. Bxd5 Nxd5 20. Qxe4 Nc3 21. Qxb7 Nxd1 22. Rxd1 1-0`

const chessComGames = Array.from({ length: 5 }, (_, index) => ({
  url: `https://www.chess.com/game/live/${index + 1}`,
  pgn: basePgn,
  end_time: 1788269500 - index * 3600,
  time_control: "600+5",
  time_class: "rapid",
  rules: "chess",
  white: { username: chessComUsername, rating: 1700 + index, result: "win" },
  black: { username: "PracticePartner", rating: 1680 + index, result: "resigned" },
  accuracies: { white: 88 + index / 2, black: 82 },
  eco: "https://www.chess.com/openings/Italian-Game",
}))

const lichessGames = Array.from({ length: 5 }, (_, index) => ({
  id: `smoke${index + 1}`,
  rated: true,
  variant: "standard",
  speed: "rapid",
  perf: "rapid",
  createdAt: 1788268000000 - index * 3600000,
  lastMoveAt: 1788269500000 - index * 3600000,
  status: "resign",
  winner: "white",
  players: {
    white: {
      user: { id: "movemirrortest", name: lichessUsername },
      rating: 1800 + index,
      analysis: { accuracy: 90 + index / 2 },
    },
    black: {
      user: { id: "practicepartner", name: "PracticePartner" },
      rating: 1780 + index,
      analysis: { accuracy: 84 },
    },
  },
  opening: { eco: "C50", name: "Italian Game", ply: 6 },
  moves: "e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6 d3 O-O Nc3 d6 Be3 Be6 Qd2 Qd7 Rad1 Rad8 h3 h6 a3 a6 b4 Ba7 Bxa7 Nxa7 Qe3 Nc6 Nd5 Bxd5 exd5 Ne7 d4 e4 Nd2 Nexd5 Bxd5 Nxd5 Qxe4 Nc3 Qxb7 Nxd1 Rxd1",
  pgn: basePgn,
  clock: { initial: 600, increment: 5, totalTime: 800 },
}))

const originalFetch = globalThis.fetch
globalThis.fetch = async (input) => {
  const url = String(input)

  if (url.endsWith("/player/movemirrortest")) {
    return Response.json({
      username: chessComUsername,
      url: `https://www.chess.com/member/${chessComUsername}`,
      title: "NM",
    })
  }
  if (url.endsWith("/player/movemirrortest/games/archives")) {
    return Response.json({
      archives: ["https://api.chess.com/pub/player/movemirrortest/games/2026/09"],
    })
  }
  if (url.endsWith("/player/movemirrortest/games/2026/09")) {
    return Response.json({ games: chessComGames })
  }
  if (url.includes("lichess.org/api/games/user/MoveMirrorTest")) {
    return new Response(lichessGames.map((game) => JSON.stringify(game)).join("\n"), {
      headers: { "Content-Type": "application/x-ndjson" },
    })
  }

  throw new Error(`Unexpected smoke-test request: ${url}`)
}

const vite = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
})

try {
  const { analyzeGames } = await vite.ssrLoadModule("/lib/analyze.ts")
  const { fetchRecentGames: fetchRecentChessComGames } = await vite.ssrLoadModule(
    "/lib/chesscom.ts",
  )
  const { fetchRecentLichessGames } = await vite.ssrLoadModule("/lib/lichess.ts")

  const cases = [
    {
      platform: "chesscom",
      username: chessComUsername,
      fetchGames: fetchRecentChessComGames,
    },
    {
      platform: "lichess",
      username: lichessUsername,
      fetchGames: fetchRecentLichessGames,
    },
  ]
  const summaries = []

  for (const testCase of cases) {
    const result = await testCase.fetchGames({
      username: testCase.username,
      count: 5,
      filter: "all",
    })
    const report = analyzeGames(
      result.profile.username,
      result.games,
      result.games.length,
      testCase.platform,
    )

    if (report.gamesAnalyzed !== 5) {
      throw new Error(`Expected five ${testCase.platform} games to be analyzed`)
    }
    if (report.recommendations.length !== 3) throw new Error("Expected three recommendations")
    if (report.strengths.length !== 3 || report.weaknesses.length !== 3) {
      throw new Error("Expected three strengths and three weaknesses")
    }
    if (report.recommendations.some((item) => !item.lichessTheme)) {
      throw new Error("Every recommendation must map to a Lichess puzzle theme")
    }

    summaries.push({
      platform: report.platform,
      username: report.username,
      gamesAnalyzed: report.gamesAnalyzed,
      recommendations: report.recommendations.map((item) => ({
        category: item.category,
        lichessTheme: item.lichessTheme,
      })),
    })
  }

  console.log(JSON.stringify(summaries, null, 2))
} finally {
  globalThis.fetch = originalFetch
  await vite.close()
}
