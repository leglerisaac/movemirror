export type GameFilter = "all" | "rapid" | "blitz" | "bullet" | "daily"

export type Outcome = "win" | "draw" | "loss"

export interface ChessComPlayer {
  username: string
  rating: number
  result: string
  "@id"?: string
}

export interface ChessComGame {
  url: string
  pgn: string
  fen?: string
  rated?: boolean
  end_time: number
  time_control: string
  time_class: Exclude<GameFilter, "all">
  rules: string
  white: ChessComPlayer
  black: ChessComPlayer
  accuracies?: {
    white?: number
    black?: number
  }
  eco?: string
}

export interface ChessComProfile {
  username: string
  url: string
  avatar?: string
  name?: string
  title?: string
  status?: string
  joined?: number
}

export interface FetchProgress {
  stage: "profile" | "archives" | "games" | "analysis"
  label: string
  percent: number
}

export interface FetchGamesResult {
  profile: ChessComProfile
  games: ChessComGame[]
  monthsScanned: number
  availableArchives: number
}

export interface RecordSummary {
  games: number
  wins: number
  draws: number
  losses: number
  scorePct: number
}

export interface SplitSummary extends RecordSummary {
  label: string
}

export interface Finding {
  title: string
  value: string
  detail: string
  score: number
}

export interface PuzzleRecommendation {
  category: string
  reason: string
  practice: string
  signal: string
  score: number
}

export interface PhaseSummary {
  phase: "Opening" | "Middlegame" | "Endgame"
  value: number | null
  display: string
  detail: string
  sample: number
}

export interface OpeningSummary extends RecordSummary {
  name: string
}

export interface GameSummary {
  url: string
  opponent: string
  opponentRating: number
  userRating: number
  color: "White" | "Black"
  outcome: Outcome
  timeClass: string
  timeControl: string
  opening: string
  accuracy: number | null
  endTime: number
  plies: number
}

export interface DiagnosticMetrics {
  cleanOpeningRate: number | null
  openingSample: number
  developmentScore: number | null
  middlegameStability: number | null
  middlegameSample: number
  endgameScore: number | null
  endgameSample: number
  castleRate: number | null
  castleSample: number
  hangingLosses: number
  forkExposures: number
  linePressureExposures: number
  checkmateLosses: number
  backRankLosses: number
  timeoutLosses: number
  advantageChances: number
  convertedAdvantages: number
  deficitGames: number
  savedDeficits: number
  averageAccuracy: number | null
  accuracySample: number
}

export interface AnalysisReport {
  username: string
  requestedGames: number
  gamesAnalyzed: number
  gamesSkipped: number
  dateFrom: number
  dateTo: number
  confidence: "Early read" | "Medium" | "High"
  record: RecordSummary
  byColor: SplitSummary[]
  byTimeClass: SplitSummary[]
  averageRating: number
  averageOpponentRating: number
  strengths: Finding[]
  weaknesses: Finding[]
  recommendations: PuzzleRecommendation[]
  phases: PhaseSummary[]
  openings: OpeningSummary[]
  recentGames: GameSummary[]
  metrics: DiagnosticMetrics
}
