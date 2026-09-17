import type { AnalysisReport, PuzzleRecommendation } from "./types"

export interface TrainingWeek {
  week: number
  title: string
  focus: string
  sessions: string[]
  checkpoint: string
}

export interface DeepReport {
  headline: string
  openingLeak: {
    name: string
    games: number
    scorePct: number
    detail: string
  } | null
  plan: TrainingWeek[]
  retestGames: number
}

function recommendationAt(
  report: AnalysisReport,
  index: number,
): PuzzleRecommendation {
  return report.recommendations[index] ?? report.recommendations[0]
}

export function buildDeepReport(report: AnalysisReport): DeepReport {
  const primary = recommendationAt(report, 0)
  const secondary = recommendationAt(report, 1)
  const maintenance = recommendationAt(report, 2)
  const openingLeak = [...report.openings]
    .filter((opening) => opening.games >= 2)
    .sort((a, b) => a.scorePct - b.scorePct || b.games - a.games)[0]

  return {
    headline: `${primary.category} is the clearest high-leverage target across this ${report.gamesAnalyzed}-game sample.`,
    openingLeak: openingLeak
      ? {
          ...openingLeak,
          detail: `${openingLeak.scorePct}% result score across ${openingLeak.games} games. Review the first position where you left familiar theory, then write down one safer plan for each side.`,
        }
      : null,
    plan: [
      {
        week: 1,
        title: "Stop the biggest leak",
        focus: primary.category,
        sessions: [
          primary.practice,
          "Review the first six evidence positions without moving the pieces.",
          "Before every move, say: checks, captures, threats, loose pieces.",
        ],
        checkpoint: `Finish a slow set at 80%+ before adding speed. Signal: ${primary.signal}.`,
      },
      {
        week: 2,
        title: "Add the second pattern",
        focus: secondary.category,
        sessions: [
          secondary.practice,
          "Replay three recent losses and pause before every opponent forcing move.",
          `Keep ${primary.category.toLowerCase()} in one short maintenance set.`,
        ],
        checkpoint: `Explain both the winning idea and the best defense aloud. Signal: ${secondary.signal}.`,
      },
      {
        week: 3,
        title: openingLeak ? "Repair the recurring opening" : "Build a calmer opening routine",
        focus: openingLeak?.name ?? "Opening decisions",
        sessions: [
          openingLeak
            ? `Review all ${openingLeak.games} sampled ${openingLeak.name} games through move 12.`
            : "Review your three most common openings through move 12.",
          "Create one note for the typical pawn break, worst-placed piece and king-safety plan.",
          maintenance.practice,
        ],
        checkpoint: "Play at least three games where you can name your plan by move 10.",
      },
      {
        week: 4,
        title: "Mix, test and measure",
        focus: "Transfer to games",
        sessions: [
          "Play a mixed puzzle set with no theme labels.",
          "Play three slower games and annotate critical decisions before engine review.",
          `Run MoveMirror again after ${Math.min(40, Math.max(20, report.gamesAnalyzed))} new games.`,
        ],
        checkpoint: "Compare the same signals, not just rating: material drops, piece safety and result score.",
      },
    ],
    retestGames: Math.min(40, Math.max(20, report.gamesAnalyzed)),
  }
}

export function reportSummary(report: AnalysisReport) {
  const source = report.platform === "lichess" ? "Lichess" : "Chess.com"
  return [
    `MoveMirror report for @${report.username} on ${source}`,
    `${report.gamesAnalyzed} games · ${report.record.scorePct}% result score · ${report.averageRating} average rating`,
    `Strengths: ${report.strengths.map((item) => item.title).join(", ")}`,
    `Improve: ${report.weaknesses.map((item) => item.title).join(", ")}`,
    `Train next: ${report.recommendations.map((item) => item.category).join(" → ")}`,
    "https://chess.leglord.com",
  ].join("\n")
}
