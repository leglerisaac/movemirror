export type ChessPlatform = "chesscom" | "lichess"

export type TimeClass =
  | "ultraBullet"
  | "bullet"
  | "blitz"
  | "rapid"
  | "classical"
  | "correspondence"
  | "daily"

export type GameFilter = "all" | TimeClass

export type Outcome = "win" | "draw" | "loss"

export interface GamePlayer {
  username: string
  rating: number
  result: string
  "@id"?: string
}

export interface ChessGame {
  url: string
  pgn: string
  fen?: string
  rated?: boolean
  end_time: number
  time_control: string
  time_class: TimeClass
  rules: string
  white: GamePlayer
  black: GamePlayer
  accuracies?: {
    white?: number
    black?: number
  }
  eco?: string
}

export interface PlayerProfile {
  platform: ChessPlatform
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
  profile: PlayerProfile
  games: ChessGame[]
  sourcesScanned: number
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
  lichessTheme: string
  score: number
}

export type TrainingPositionCategory =
  | "Loose piece"
  | "Fork or double attack"
  | "Pin, skewer or x-ray"
  | "Mating threat"
  | "Material swing"

export interface TrainingPosition {
  id: string
  fen: string
  gameUrl: string
  opponent: string
  opening: string
  color: "White" | "Black"
  moveNumber: number
  playedMove: string
  opponentReply: string
  category: TrainingPositionCategory
  reason: string
  materialSwing: number
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
  platform: ChessPlatform
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
  trainingPositions: TrainingPosition[]
  metrics: DiagnosticMetrics
}
