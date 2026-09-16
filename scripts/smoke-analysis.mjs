import { createServer } from "vite"

const username = process.argv[2] ?? "hikaru"

const vite = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
})

try {
  const { analyzeGames } = await vite.ssrLoadModule("/lib/analyze.ts")
  const { fetchRecentGames } = await vite.ssrLoadModule("/lib/chesscom.ts")
  const result = await fetchRecentGames({
    username,
    count: 8,
    filter: "all",
  })
  const report = analyzeGames(username, result.games, result.games.length)

  if (report.gamesAnalyzed < 1) throw new Error("No games were analyzed")
  if (report.recommendations.length !== 3) throw new Error("Expected three recommendations")
  if (report.strengths.length !== 3 || report.weaknesses.length !== 3) {
    throw new Error("Expected three strengths and three weaknesses")
  }

  console.log(
    JSON.stringify(
      {
        username: report.username,
        gamesAnalyzed: report.gamesAnalyzed,
        scorePct: report.record.scorePct,
        signals: {
          hangingLosses: report.metrics.hangingLosses,
          forkExposures: report.metrics.forkExposures,
          linePressureExposures: report.metrics.linePressureExposures,
        },
        recommendations: report.recommendations.map((item) => item.category),
      },
      null,
      2,
    ),
  )
} finally {
  await vite.close()
}
