import type {
  AnalysisReport,
  EngineAnalysisSummary,
  Finding,
  PuzzleRecommendation,
} from "./types"

const PRACTICE: Record<string, string> = {
  "Loose & Hanging Pieces": "10 slow puzzles · finish with a piece-safety scan",
  "Winning Material": "8 advantage puzzles · calculate the full exchange",
  "Checkmate Patterns": "Mate-in-1/2 sets · 5 minutes daily",
  "Defensive Moves": "10 defensive puzzles · find the opponent’s threat first",
  "Endgame Tactics": "6 endgame puzzles · replay every miss",
}

function engineRecommendations(engine: EngineAnalysisSummary): PuzzleRecommendation[] {
  const themes = new Map<string, {
    category: string
    lichessTheme: string
    count: number
    weight: number
    reason: string
  }>()

  for (const moment of engine.criticalMoments) {
    const current = themes.get(moment.category) ?? {
      category: moment.category,
      lichessTheme: moment.lichessTheme,
      count: 0,
      weight: 0,
      reason: moment.reason,
    }
    current.count += 1
    current.weight += Math.min(10, moment.centipawnLoss / 100)
    themes.set(moment.category, current)
  }

  return [...themes.values()]
    .sort((a, b) => b.weight - a.weight || b.count - a.count)
    .map((theme) => ({
      category: theme.category,
      reason: `${theme.reason} Stockfish found this pattern in ${theme.count} critical ${theme.count === 1 ? "moment" : "moments"}.`,
      practice: PRACTICE[theme.category] ?? "8 slow puzzles · explain the answer before moving",
      signal: `${theme.count} engine-confirmed ${theme.count === 1 ? "miss" : "misses"}`,
      lichessTheme: theme.lichessTheme,
      score: 80 + theme.weight * 4,
    }))
}

function mergeRecommendations(
  current: PuzzleRecommendation[],
  engine: EngineAnalysisSummary,
) {
  const candidates = [...engineRecommendations(engine), ...current]
  const seen = new Set<string>()
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((item) => {
      if (seen.has(item.category)) return false
      seen.add(item.category)
      return true
    })
    .slice(0, 3)
}

function engineStrengths(report: AnalysisReport, engine: EngineAnalysisSummary) {
  const bestPhase = [...engine.phases].sort((a, b) => b.precision - a.precision)[0]
  const additions: Finding[] = []
  if (bestPhase) {
    additions.push({
      title: `${bestPhase.phase} precision`,
      value: `${bestPhase.precision.toFixed(1)}%`,
      detail: `Best engine-tested phase across ${bestPhase.moves} analyzed decisions (${bestPhase.averageCentipawnLoss.toFixed(1)} average centipawn loss).`,
      score: bestPhase.precision + 8,
    })
  }
  if (engine.precision >= 78) {
    additions.push({
      title: "Engine-tested consistency",
      value: `${engine.precision.toFixed(1)}% precision`,
      detail: `Stockfish checked ${engine.movesAnalyzed} decisions across ${engine.gamesAnalyzed} recent games.`,
      score: engine.precision + 5,
    })
  }
  return [...additions, ...report.strengths]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

function engineWeaknesses(report: AnalysisReport, engine: EngineAnalysisSummary) {
  const worstPhase = [...engine.phases].sort(
    (a, b) => b.averageCentipawnLoss - a.averageCentipawnLoss,
  )[0]
  const majorErrors = engine.mistakes + engine.blunders
  const additions: Finding[] = []

  if (majorErrors > 0) {
    additions.push({
      title: "Engine-confirmed errors",
      value: `${engine.blunders} blunders · ${engine.mistakes} mistakes`,
      detail: `Stockfish compared the played move with its preferred continuation across ${engine.movesAnalyzed} decisions.`,
      score: Math.min(100, 45 + (majorErrors / Math.max(1, engine.movesAnalyzed)) * 350),
    })
  }
  if (worstPhase) {
    additions.push({
      title: `${worstPhase.phase} calculation`,
      value: `${worstPhase.averageCentipawnLoss.toFixed(1)} ACPL`,
      detail: `Your largest average evaluation loss occurred in this phase across ${worstPhase.moves} tested moves.`,
      score: Math.min(100, 35 + worstPhase.averageCentipawnLoss / 2),
    })
  }

  return [...additions, ...report.weaknesses]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
}

export function applyEngineAnalysis(
  report: AnalysisReport,
  engineAnalysis: EngineAnalysisSummary,
): AnalysisReport {
  return {
    ...report,
    strengths: engineStrengths(report, engineAnalysis),
    weaknesses: engineWeaknesses(report, engineAnalysis),
    recommendations: mergeRecommendations(report.recommendations, engineAnalysis),
    engineAnalysis,
  }
}
