"use client"

import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react"
import { FormEvent, useCallback, useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select"
import { Progress } from "@/components/ui/progress"
import {
  CoachDashboard,
  PricingSection,
  ReportProductTools,
} from "@/components/product-experience"
import { analyzeGames } from "@/lib/analyze"
import {
  EMPTY_RUNTIME_CONFIG,
  fetchEntitlement,
  loadRemoteReports,
  loadRuntimeConfig,
  startCheckout,
  trackEvent,
  type RuntimeConfig,
} from "@/lib/api"
import {
  fetchRecentGames as fetchRecentChessComGames,
  normalizeUsername,
  validateUsername,
} from "@/lib/chesscom"
import {
  fetchRecentLichessGames,
  normalizeLichessUsername,
  validateLichessUsername,
} from "@/lib/lichess"
import {
  readEntitlement,
  readSavedReports,
  saveEntitlement,
  type Entitlement,
  type SavedReport,
} from "@/lib/report-storage"
import type {
  AnalysisReport,
  ChessPlatform,
  FetchProgress,
  GameFilter,
  Outcome,
  PlayerProfile,
} from "@/lib/types"

const CHESSCOM_PUZZLE_URL = "https://www.chess.com/puzzles/learning"
const LICHESS_PUZZLE_THEMES_URL = "https://lichess.org/training/themes"

const FORMAT_OPTIONS: Record<
  ChessPlatform,
  Array<{ value: GameFilter; label: string }>
> = {
  chesscom: [
    { value: "all", label: "All standard" },
    { value: "rapid", label: "Rapid" },
    { value: "blitz", label: "Blitz" },
    { value: "bullet", label: "Bullet" },
    { value: "daily", label: "Daily" },
  ],
  lichess: [
    { value: "all", label: "All standard" },
    { value: "rapid", label: "Rapid" },
    { value: "blitz", label: "Blitz" },
    { value: "bullet", label: "Bullet" },
    { value: "ultraBullet", label: "UltraBullet" },
    { value: "classical", label: "Classical" },
    { value: "correspondence", label: "Correspondence" },
  ],
}

const ALL_FILTERS = new Set<GameFilter>(
  Object.values(FORMAT_OPTIONS).flatMap((options) =>
    options.map((option) => option.value),
  ),
)

const INITIAL_PROGRESS: FetchProgress = {
  stage: "profile",
  label: "Ready to analyze",
  percent: 0,
}

function formatDate(timestamp: number, compact = false) {
  return new Intl.DateTimeFormat("en-US", {
    month: compact ? "short" : "long",
    day: "numeric",
    year: compact ? "2-digit" : "numeric",
  }).format(new Date(timestamp * 1000))
}

function formatTimeControl(value: string, timeClass: string) {
  if (timeClass.toLowerCase() === "daily") return "Daily"
  if (value.includes("/")) {
    const [, seconds] = value.split("/").map(Number)
    if (Number.isFinite(seconds)) return `${Math.round(seconds / 86400)}d/move`
  }

  const [base, increment] = value.split("+").map(Number)
  if (!Number.isFinite(base)) return value
  const baseLabel = base < 60 ? `${base}s` : `${Math.round(base / 60)}m`
  return increment ? `${baseLabel} + ${increment}s` : baseLabel
}

function outcomeLabel(outcome: Outcome) {
  if (outcome === "win") return "Won"
  if (outcome === "draw") return "Draw"
  return "Lost"
}

function platformLabel(platform: ChessPlatform) {
  return platform === "lichess" ? "Lichess" : "Chess.com"
}

function puzzleUrl(
  platform: ChessPlatform,
  recommendation: AnalysisReport["recommendations"][number],
) {
  return platform === "lichess"
    ? `https://lichess.org/training/${recommendation.lichessTheme}`
    : CHESSCOM_PUZZLE_URL
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

function EmptyPreview() {
  return (
    <section className="preview-grid" aria-label="What MoveMirror measures">
      <article className="preview-card preview-card-featured">
        <span className="card-index">01</span>
        <div className="mini-board" aria-hidden="true">
          {Array.from({ length: 16 }, (_, index) => (
            <span key={index} className={index === 6 || index === 9 ? "active" : ""} />
          ))}
        </div>
        <div>
          <h2>Replay, don’t guess</h2>
          <p>
            Every move is replayed to measure material swings, loose pieces,
            double attacks, king safety and which phase breaks down.
          </p>
        </div>
      </article>

      <article className="preview-card">
        <span className="card-index">02</span>
        <div className="preview-icon"><BarChart3 /></div>
        <h2>Find repeatable signals</h2>
        <p>One bad game is noise. The report ranks patterns that repeat across the sample.</p>
      </article>

      <article className="preview-card">
        <span className="card-index">03</span>
        <div className="preview-icon"><Target /></div>
        <h2>Leave with a drill</h2>
        <p>Your top three training categories include a specific weekly practice dose.</p>
      </article>
    </section>
  )
}

function LoadingPanel({
  progress,
  platform,
}: {
  progress: FetchProgress
  platform: ChessPlatform
}) {
  const steps = [
    { key: "profile", label: "Player" },
    { key: "archives", label: platform === "lichess" ? "Game feed" : "Archives" },
    { key: "games", label: "Games" },
    { key: "analysis", label: "Patterns" },
  ]
  const activeIndex = steps.findIndex((step) => step.key === progress.stage)

  return (
    <section className="loading-panel" aria-live="polite" aria-busy="true">
      <div className="loading-orbit" aria-hidden="true">
        <span />
        <Loader2 />
      </div>
      <div className="loading-copy">
        <p className="eyebrow">Reading the board</p>
        <h2>{progress.label}</h2>
        <Progress value={progress.percent} className="analysis-progress" />
        <div className="loading-steps" aria-label="Analysis steps">
          {steps.map((step, index) => (
            <span
              key={step.key}
              className={index < activeIndex ? "done" : index === activeIndex ? "active" : ""}
            >
              {index < activeIndex ? <Check /> : <i>{index + 1}</i>}
              {step.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note: string
}) {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  )
}

function FindingsColumn({
  title,
  kicker,
  items,
  type,
}: {
  title: string
  kicker: string
  items: AnalysisReport["strengths"]
  type: "strength" | "weakness"
}) {
  return (
    <section className={`findings-panel ${type}`}>
      <header>
        <span className="section-kicker">{kicker}</span>
        <h2>{title}</h2>
      </header>
      <div className="finding-list">
        {items.map((item, index) => (
          <article className="finding" key={`${item.title}-${index}`}>
            <span className="finding-number">0{index + 1}</span>
            <div>
              <div className="finding-heading">
                <h3>{item.title}</h3>
                <strong>{item.value}</strong>
              </div>
              <p>{item.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function Report({
  report,
  profile,
  filter,
  entitlement,
  runtimeConfig,
  savedReports,
  onSavedReportsChange,
  onRequestProduct,
  onReset,
}: {
  report: AnalysisReport
  profile: PlayerProfile
  filter: GameFilter
  entitlement: Entitlement
  runtimeConfig: RuntimeConfig
  savedReports: SavedReport[]
  onSavedReportsChange: (reports: SavedReport[]) => void
  onRequestProduct: (product: "deep" | "plus" | "coach") => void
  onReset: () => void
}) {
  const accuracy = report.metrics.averageAccuracy
  const period = `${formatDate(report.dateFrom)} – ${formatDate(report.dateTo)}`
  const sourceName = platformLabel(report.platform)
  const allPuzzlesUrl =
    report.platform === "lichess" ? LICHESS_PUZZLE_THEMES_URL : CHESSCOM_PUZZLE_URL

  return (
    <div className="report" id="report">
      <section className="player-strip">
        <div className="player-identity">
          {profile.avatar ? (
            // Public profile images are intentionally displayed as supplied by the platform.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar} alt="" />
          ) : (
            <div className="avatar-fallback" aria-hidden="true">
              {report.username.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div className="player-name-line">
              <h2>
                <a href={profile.url} target="_blank" rel="noreferrer">
                  {profile.name || profile.username}
                </a>
              </h2>
              {profile.title && <Badge className="title-badge">{profile.title}</Badge>}
            </div>
            <p>@{profile.username} on {sourceName} · {period}</p>
          </div>
        </div>
        <div className="player-actions">
          <Badge variant="outline" className="confidence-badge">
            <span className="confidence-dot" /> {report.confidence} confidence
          </Badge>
          <Button variant="outline" onClick={onReset} className="new-analysis-button">
            <RefreshCcw /> New analysis
          </Button>
        </div>
      </section>

      <section className="stats-grid" aria-label="Analysis summary">
        <StatCard
          label="Result score"
          value={`${report.record.scorePct}%`}
          note={`${report.record.wins}W · ${report.record.draws}D · ${report.record.losses}L`}
        />
        <StatCard
          label="Games replayed"
          value={String(report.gamesAnalyzed)}
          note={report.gamesSkipped ? `${report.gamesSkipped} unusable PGNs skipped` : "Every downloaded PGN parsed"}
        />
        <StatCard
          label="Average rating"
          value={String(report.averageRating)}
          note={`Opponents averaged ${report.averageOpponentRating}`}
        />
        <StatCard
          label={`${sourceName} accuracy`}
          value={accuracy === null ? "—" : accuracy.toFixed(1)}
          note={
            accuracy === null
              ? "Not available in this sample"
              : `Available for ${report.metrics.accuracySample} games`
          }
        />
      </section>

      <ReportProductTools
        report={report}
        filter={filter}
        entitlement={entitlement}
        config={runtimeConfig}
        savedReports={savedReports}
        onSavedReportsChange={onSavedReportsChange}
        onRequestProduct={onRequestProduct}
      />

      <section className="report-section overview-section">
        <div className="section-heading split-heading">
          <div>
            <span className="section-kicker">The clearest read</span>
            <h2>What your games repeat</h2>
          </div>
          <p>
            These are relative to this sample—not permanent labels. Analyze another
            20–40 games after a few weeks of practice to check the trend.
          </p>
        </div>
        <div className="findings-grid">
          <FindingsColumn
            title="Best-performing areas"
            kicker="Strengths"
            items={report.strengths}
            type="strength"
          />
          <FindingsColumn
            title="Highest-leverage gaps"
            kicker="Weaknesses"
            items={report.weaknesses}
            type="weakness"
          />
        </div>
      </section>

      <section className="report-section phase-section">
        <div className="section-heading split-heading">
          <div>
            <span className="section-kicker">Game phases</span>
            <h2>Where the position changes</h2>
          </div>
          <p>Each bar uses a phase-specific signal, so the detail under it matters.</p>
        </div>
        <div className="phase-grid">
          {report.phases.map((phase, index) => (
            <article className="phase-card" key={phase.phase}>
              <div className="phase-topline">
                <span>0{index + 1}</span>
                <strong>{phase.display}</strong>
              </div>
              <h3>{phase.phase}</h3>
              <div className="phase-track" aria-hidden="true">
                <span style={{ width: `${phase.value ?? 0}%` }} />
              </div>
              <p>{phase.detail}</p>
              <small>{phase.sample} eligible games</small>
            </article>
          ))}
        </div>
      </section>

      <section className="report-section recommendations-section">
        <div className="recommendation-heading">
          <div>
            <span className="section-kicker">Your training queue</span>
            <h2>Three puzzle themes to work next</h2>
          </div>
          <a
            href={allPuzzlesUrl}
            target="_blank"
            rel="noreferrer"
            className="text-link"
            onClick={() =>
              trackEvent({
                event: "puzzle_clicked",
                platform: report.platform,
                gameCount: report.gamesAnalyzed,
              })
            }
          >
            {report.platform === "lichess" ? "Browse Lichess Puzzle Themes" : "Open Chess.com Custom Puzzles"} <ArrowUpRight />
          </a>
        </div>
        <div className="recommendation-list">
          {report.recommendations.map((recommendation, index) => (
            <article className="recommendation" key={recommendation.category}>
              <div className="recommendation-rank">
                <span>{index === 0 ? "Start here" : index === 1 ? "Then" : "Maintain"}</span>
                <strong>0{index + 1}</strong>
              </div>
              <div className="recommendation-main">
                <h3>{recommendation.category}</h3>
                <p>{recommendation.reason}</p>
                <span className="signal"><Sparkles /> {recommendation.signal}</span>
              </div>
              <div className="practice-dose">
                <span>Practice dose</span>
                <strong>{recommendation.practice}</strong>
                <a
                  href={puzzleUrl(report.platform, recommendation)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    trackEvent({
                      event: "puzzle_clicked",
                      platform: report.platform,
                      gameCount: report.gamesAnalyzed,
                    })
                  }
                  aria-label={`Practice ${recommendation.category} on ${sourceName}`}
                >
                  {report.platform === "lichess" ? "Open this Lichess theme" : "Find the closest theme"} <ChevronRight />
                </a>
              </div>
            </article>
          ))}
        </div>
        <p className="taxonomy-note">
          {report.platform === "lichess"
            ? "Each recommendation opens the closest matching Lichess puzzle theme. Sign in there if you want Lichess to track your progress."
            : "Chess.com refreshed its puzzle taxonomy in September 2026, so a theme’s exact label may vary. Choose the closest wording shown in Custom Puzzles."}
        </p>
      </section>

      <section className="report-section details-grid">
        <article className="detail-panel">
          <div className="detail-heading">
            <div>
              <span className="section-kicker">Repertoire snapshot</span>
              <h2>Most-played openings</h2>
            </div>
            <Trophy />
          </div>
          <div className="opening-list">
            {report.openings.map((opening) => (
              <div className="opening-row" key={opening.name}>
                <div>
                  <strong>{opening.name}</strong>
                  <span>{opening.games} {opening.games === 1 ? "game" : "games"} · {opening.wins}W/{opening.draws}D/{opening.losses}L</span>
                </div>
                <span className="opening-score">{opening.scorePct}%</span>
              </div>
            ))}
          </div>
        </article>

        <article className="detail-panel split-panel">
          <div className="detail-heading">
            <div>
              <span className="section-kicker">Performance split</span>
              <h2>Color & time control</h2>
            </div>
            <BarChart3 />
          </div>
          <div className="split-groups">
            <div>
              <span className="split-label">By color</span>
              {report.byColor.map((split) => (
                <div className="split-row" key={split.label}>
                  <span>{split.label}</span>
                  <div><i style={{ width: `${split.scorePct}%` }} /></div>
                  <strong>{split.scorePct}%</strong>
                </div>
              ))}
            </div>
            <div>
              <span className="split-label">By speed</span>
              {report.byTimeClass.map((split) => (
                <div className="split-row" key={split.label}>
                  <span>{split.label}</span>
                  <div><i style={{ width: `${split.scorePct}%` }} /></div>
                  <strong>{split.scorePct}%</strong>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="report-section recent-section">
        <div className="section-heading split-heading">
          <div>
            <span className="section-kicker">Audit trail</span>
            <h2>Recent games in the sample</h2>
          </div>
          <p>Open any game on {sourceName} to compare the report with the full board review.</p>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Result</th>
                <th>Opponent</th>
                <th>Color</th>
                <th>Format</th>
                <th>Opening</th>
                <th>Accuracy</th>
                <th>Date</th>
                <th><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {report.recentGames.map((game) => (
                <tr key={game.url}>
                  <td><span className={`result-pill ${game.outcome}`}>{outcomeLabel(game.outcome)}</span></td>
                  <td><strong>{game.opponent}</strong><span className="cell-note">{game.opponentRating}</span></td>
                  <td>{game.color}</td>
                  <td><strong>{game.timeClass}</strong><span className="cell-note">{formatTimeControl(game.timeControl, game.timeClass)}</span></td>
                  <td className="opening-cell">{game.opening}</td>
                  <td>{game.accuracy === null ? "—" : game.accuracy.toFixed(1)}</td>
                  <td>{formatDate(game.endTime, true)}</td>
                  <td><a href={game.url} target="_blank" rel="noreferrer" aria-label={`Open game against ${game.opponent}`}><ExternalLink /></a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default function Home() {
  const [platform, setPlatform] = useState<ChessPlatform>("chesscom")
  const [username, setUsername] = useState("")
  const [gameCount, setGameCount] = useState(30)
  const [filter, setFilter] = useState<GameFilter>("all")
  const [progress, setProgress] = useState(INITIAL_PROGRESS)
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [error, setError] = useState("")
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(EMPTY_RUNTIME_CONFIG)
  const [entitlement, setEntitlement] = useState<Entitlement>({ tier: "free" })
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const entitlementRef = useRef<Entitlement>({ tier: "free" })
  const checkoutInitializedRef = useRef(false)

  const runAnalysis = useCallback(
    async (overrides?: {
      platform?: ChessPlatform
      username?: string
      count?: number
      filter?: GameFilter
      entitlement?: Entitlement
    }) => {
      const requestedPlatform = overrides?.platform ?? platform
      const normalize =
        requestedPlatform === "lichess" ? normalizeLichessUsername : normalizeUsername
      const validate =
        requestedPlatform === "lichess" ? validateLichessUsername : validateUsername
      const requestedUsername = normalize(overrides?.username ?? username)
      const requestedCount = Math.round(overrides?.count ?? gameCount)
      const requestedFilter = overrides?.filter ?? filter
      const requestedEntitlement = overrides?.entitlement ?? entitlementRef.current
      const deepMatches =
        requestedEntitlement.tier === "deep" &&
        requestedEntitlement.deepReport?.platform === requestedPlatform &&
        requestedEntitlement.deepReport.username.toLowerCase() === requestedUsername.toLowerCase()
      const maxGames =
        requestedEntitlement.tier === "plus" || requestedEntitlement.tier === "coach"
          ? 200
          : deepMatches
            ? requestedEntitlement.deepReport?.gameCount ?? 150
            : 30

      if (!validate(requestedUsername)) {
        const message = `Enter a valid ${platformLabel(requestedPlatform)} username (letters, numbers, dashes or underscores).`
        setError(message)
        setStatus("error")
        throw new Error(message)
      }
      if (!FORMAT_OPTIONS[requestedPlatform].some((option) => option.value === requestedFilter)) {
        const message = `${platformLabel(requestedPlatform)} does not use that game format. Choose one of the formats shown.`
        setError(message)
        setStatus("error")
        throw new Error(message)
      }
      if (requestedCount < 5 || requestedCount > maxGames) {
        const message =
          maxGames === 30
            ? "The free report analyzes up to 30 games. Choose 30 or fewer, or use a paid report for a larger sample."
            : `Choose between 5 and ${maxGames} games for this access level.`
        setError(message)
        setStatus("error")
        throw new Error(message)
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setPlatform(requestedPlatform)
      setUsername(requestedUsername)
      setGameCount(requestedCount)
      setFilter(requestedFilter)
      setStatus("loading")
      setError("")
      setReport(null)
      setProfile(null)
      setProgress({ ...INITIAL_PROGRESS, label: "Starting the analysis…", percent: 2 })
      trackEvent({
        event: "analysis_started",
        platform: requestedPlatform,
        gameCount: requestedCount,
      })

      try {
        const fetchGames =
          requestedPlatform === "lichess"
            ? fetchRecentLichessGames
            : fetchRecentChessComGames
        const result = await fetchGames({
          username: requestedUsername,
          count: requestedCount,
          filter: requestedFilter,
          signal: controller.signal,
          onProgress: setProgress,
        })

        setProgress({
          stage: "analysis",
          label: `Replaying ${result.games.length} games move by move…`,
          percent: 76,
        })
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        const nextReport = analyzeGames(
          result.profile.username,
          result.games,
          requestedCount,
          requestedPlatform,
        )
        setProgress({
          stage: "analysis",
          label: "Ranking the strongest training signals…",
          percent: 96,
        })
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        setProfile(result.profile)
        setReport(nextReport)
        setStatus("success")
        setProgress({ stage: "analysis", label: "Analysis complete", percent: 100 })
        trackEvent({
          event: "analysis_completed",
          platform: requestedPlatform,
          gameCount: nextReport.gamesAnalyzed,
        })
        window.setTimeout(() => {
          document.getElementById("report")?.scrollIntoView({ behavior: "smooth", block: "start" })
        }, 80)
        return nextReport
      } catch (caught) {
        if (controller.signal.aborted) throw caught
        const message =
          caught instanceof Error
            ? caught.message
            : "Something went wrong while analyzing those games."
        setError(message)
        setStatus("error")
        trackEvent({
          event: "analysis_failed",
          platform: requestedPlatform,
          gameCount: requestedCount,
        })
        throw caught
      }
    },
    [filter, gameCount, platform, username],
  )

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      setSavedReports(readSavedReports())
      const stored = readEntitlement()
      entitlementRef.current = stored
      setEntitlement(stored)
    }, 0)
    void loadRuntimeConfig().then(setRuntimeConfig)
    return () => window.clearTimeout(hydration)
  }, [])

  useEffect(() => {
    if (checkoutInitializedRef.current) return
    checkoutInitializedRef.current = true

    const url = new URL(window.location.href)
    const checkoutSession = url.searchParams.get("session_id")
    const sessionId = checkoutSession || readEntitlement().sessionId
    if (!sessionId) return

    void fetchEntitlement(sessionId)
      .then((verified) => {
        const next: Entitlement = { ...verified, sessionId }
        entitlementRef.current = next
        setEntitlement(next)
        saveEntitlement(next)
        if (checkoutSession) {
          url.searchParams.delete("checkout")
          url.searchParams.delete("session_id")
          window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
        }
        if (
          next.tier === "deep" &&
          next.deepReport?.username &&
          (next.deepReport.platform === "chesscom" || next.deepReport.platform === "lichess")
        ) {
          void runAnalysis({
            platform: next.deepReport.platform,
            username: next.deepReport.username,
            count: next.deepReport.gameCount,
            filter: next.deepReport.filter as GameFilter,
            entitlement: next,
          }).catch(() => undefined)
        }
        if (next.sessionId && (next.tier === "plus" || next.tier === "coach")) {
          void loadRemoteReports(next.sessionId)
            .then(({ reports }) => {
              const merged = [...reports, ...readSavedReports()].filter(
                (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index,
              )
              setSavedReports(merged)
            })
            .catch(() => undefined)
        }
      })
      .catch(() => {
        if (checkoutSession) setError("Checkout could not be verified. No access was changed.")
      })
  }, [runAnalysis])

  useEffect(() => {
    const context = document.modelContext
    if (!context?.registerTool) return
    const lifecycle = new AbortController()

    void Promise.resolve(
      context.registerTool(
        {
          name: "analyze_chess_games",
          title: "Analyze Chess.com or Lichess games",
          description:
            "Analyze a public Chess.com or Lichess player's recent standard games and update the visible MoveMirror report with strengths, weaknesses, and platform-specific puzzle recommendations.",
          inputSchema: {
            type: "object",
            properties: {
              platform: {
                type: "string",
                enum: ["chesscom", "lichess"],
                default: "chesscom",
                description: "The chess platform that owns the account",
              },
              username: { type: "string", description: "Public account username" },
              count: { type: "integer", minimum: 5, maximum: 30, default: 30 },
              filter: {
                type: "string",
                enum: [
                  "all",
                  "rapid",
                  "blitz",
                  "bullet",
                  "daily",
                  "ultraBullet",
                  "classical",
                  "correspondence",
                ],
                default: "all",
              },
            },
            required: ["username"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          async execute(input: unknown) {
            if (!input || typeof input !== "object") throw new Error("Input must be an object.")
            const candidate = input as {
              platform?: unknown
              username?: unknown
              count?: unknown
              filter?: unknown
            }
            if (typeof candidate.username !== "string") throw new Error("username is required.")
            const nextPlatform =
              candidate.platform === undefined ? "chesscom" : String(candidate.platform)
            if (nextPlatform !== "chesscom" && nextPlatform !== "lichess") {
              throw new Error("platform must be chesscom or lichess.")
            }
            const count = candidate.count === undefined ? 30 : Number(candidate.count)
            const nextFilter = candidate.filter === undefined ? "all" : String(candidate.filter)
            if (!ALL_FILTERS.has(nextFilter as GameFilter)) {
              throw new Error("filter is not a supported game format.")
            }
            const nextReport = await runAnalysis({
              platform: nextPlatform,
              username: candidate.username,
              count,
              filter: nextFilter as GameFilter,
            })
            return {
              platform: nextReport.platform,
              username: nextReport.username,
              gamesAnalyzed: nextReport.gamesAnalyzed,
              scorePct: nextReport.record.scorePct,
              strengths: nextReport.strengths.map((item) => item.title),
              weaknesses: nextReport.weaknesses.map((item) => item.title),
              puzzleRecommendations: nextReport.recommendations.map((item) => item.category),
            }
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {
      // WebMCP is progressive enhancement; the visible form remains fully functional.
    })

    return () => lifecycle.abort()
  }, [runAnalysis])

  useEffect(() => () => abortRef.current?.abort(), [])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runAnalysis().catch(() => undefined)
  }

  const choosePlatform = (nextPlatform: ChessPlatform) => {
    if (status === "loading" || nextPlatform === platform) return
    setPlatform(nextPlatform)
    setFilter("all")
    setError("")
    if (status === "error") setStatus("idle")
  }

  const reset = () => {
    abortRef.current?.abort()
    setReport(null)
    setProfile(null)
    setError("")
    setStatus("idle")
    setProgress(INITIAL_PROGRESS)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const deepMatchesInput =
    entitlement.tier === "deep" &&
    entitlement.deepReport?.platform === platform &&
    entitlement.deepReport.username.toLowerCase() === username.trim().toLowerCase()
  const inputGameLimit =
    entitlement.tier === "plus" || entitlement.tier === "coach"
      ? 200
      : deepMatchesInput
        ? entitlement.deepReport?.gameCount ?? 150
        : 30

  const requestProduct = (product: "deep" | "plus" | "coach") => {
    if (!runtimeConfig.products[product]) {
      document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })
      return
    }
    if (product === "deep" && !report) {
      setError("Run the free analysis first so the Deep Report is tied to the right account.")
      setStatus("error")
      document.getElementById("top")?.scrollIntoView({ behavior: "smooth" })
      return
    }
    void startCheckout({
      product,
      platform: report?.platform,
      username: report?.username,
      filter,
    }).catch((checkoutError) => {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not start.")
      document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" })
    })
  }

  const analyzeSavedPlayer = (nextPlatform: ChessPlatform, nextUsername: string) => {
    window.scrollTo({ top: 0, behavior: "smooth" })
    void runAnalysis({
      platform: nextPlatform,
      username: nextUsername,
      count: entitlement.tier === "coach" ? 60 : 30,
      filter: "all",
      entitlement,
    }).catch(() => undefined)
  }

  return (
    <main>
      <header className="site-header">
        <a href="#top" className="brand" aria-label="MoveMirror home">
          <BrandMark />
          <span>MoveMirror</span>
        </a>
        <div className="header-meta">
          <span><LockKeyhole /> No login or password</span>
          <a href="#method">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#coach">For coaches</a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-copy">
          <Badge className="hero-badge"><ShieldCheck /> Public data · private analysis</Badge>
          <h1>Your games already know <em>what to train next.</em></h1>
          <p>
            Enter a Chess.com or Lichess username. MoveMirror replays recent games,
            finds recurring strengths and leaks, then turns them into a focused puzzle plan.
          </p>
        </div>

        <form className="analyzer-form" onSubmit={handleSubmit} noValidate>
          <div className="form-heading">
            <div>
              <span className="section-kicker">Start an analysis</span>
              <h2>Whose games should we read?</h2>
            </div>
            <span className="form-time"><Clock3 /> Usually under 30 seconds</span>
          </div>

          <div className="platform-picker" role="group" aria-label="Chess platform">
            <span>Analyze from</span>
            <div>
              <button
                type="button"
                className={platform === "chesscom" ? "active" : ""}
                aria-pressed={platform === "chesscom"}
                onClick={() => choosePlatform("chesscom")}
                disabled={status === "loading"}
              >
                <i className="platform-dot chesscom-dot" aria-hidden="true" />
                Chess.com
              </button>
              <button
                type="button"
                className={platform === "lichess" ? "active" : ""}
                aria-pressed={platform === "lichess"}
                onClick={() => choosePlatform("lichess")}
                disabled={status === "loading"}
              >
                <i className="platform-dot lichess-dot" aria-hidden="true" />
                Lichess
              </button>
            </div>
          </div>

          <div className="form-grid">
            <label className="username-field">
              <span>{platformLabel(platform)} username</span>
              <div className="input-shell">
                <span aria-hidden="true">@</span>
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={platform === "lichess" ? "e.g. thibault" : "e.g. gothamchess"}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={status === "loading"}
                  aria-invalid={status === "error"}
                />
              </div>
            </label>

            <label>
              <span>Games</span>
              <Input
                type="number"
                min={5}
                max={inputGameLimit}
                step={5}
                value={gameCount}
                onChange={(event) => setGameCount(Number(event.target.value))}
                disabled={status === "loading"}
              />
            </label>

            <label>
              <span>Format</span>
              <NativeSelect
                value={filter}
                onChange={(event) => setFilter(event.target.value as GameFilter)}
                disabled={status === "loading"}
                aria-label="Game format"
              >
                {FORMAT_OPTIONS[platform].map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>

            <Button type="submit" size="lg" disabled={status === "loading"}>
              {status === "loading" ? <Loader2 className="spin" /> : <Search />}
              {status === "loading" ? "Analyzing…" : "Analyze games"}
            </Button>
          </div>

          <div className="form-footer">
            <span><LockKeyhole /> Analysis runs in this browser. Saving is always your choice.</span>
            <span>Free: 5–30 games · Paid: up to 200 · Standard chess only</span>
          </div>

          {status === "error" && error && (
            <div className="error-message" role="alert">
              <CircleAlert />
              <span>{error}</span>
            </div>
          )}
        </form>
      </section>

      <div className="page-shell">
        {status === "loading" && <LoadingPanel progress={progress} platform={platform} />}
        {status === "success" && report && profile && (
          <Report
            report={report}
            profile={profile}
            filter={filter}
            entitlement={entitlement}
            runtimeConfig={runtimeConfig}
            savedReports={savedReports}
            onSavedReportsChange={setSavedReports}
            onRequestProduct={requestProduct}
            onReset={reset}
          />
        )}
        {(status === "idle" || status === "error") && !report && <EmptyPreview />}

        <section className="method-section" id="method">
          <div className="method-heading">
            <span className="section-kicker">Method & limits</span>
            <h2>An honest read, not a mystery score</h2>
          </div>
          <div className="method-grid">
            <article>
              <span><Check /> What it uses</span>
              <p>
                Public PGNs, results, ratings, time controls, opening names and any
                accuracy values already attached by Chess.com or Lichess.
              </p>
            </article>
            <article>
              <span><Target /> What it detects</span>
              <p>
                Material changes, development, castling, endgame entry, likely
                undefended-piece losses, double attacks and vulnerable piece line-ups.
              </p>
            </article>
            <article>
              <span><CircleAlert /> What it cannot prove</span>
              <p>
                The free report uses explainable pattern signals. Paid evidence positions
                can run a local Stockfish check, but no automated score replaces human review.
              </p>
            </article>
          </div>
          <div className="source-line">
            <span>Built on read-only public data. Not affiliated with Chess.com or Lichess.</span>
            <div>
              <a href="https://www.chess.com/news/view/published-data-api" target="_blank" rel="noreferrer">Chess.com API <ExternalLink /></a>
              <a href="https://lichess.org/api#tag/Games/operation/apiGamesUser" target="_blank" rel="noreferrer">Lichess API <ExternalLink /></a>
              <a href={LICHESS_PUZZLE_THEMES_URL} target="_blank" rel="noreferrer">Lichess themes <ExternalLink /></a>
            </div>
          </div>
        </section>

        <PricingSection config={runtimeConfig} report={report} filter={filter} />
        <CoachDashboard
          entitlement={entitlement}
          savedReports={savedReports}
          onSavedReportsChange={setSavedReports}
          onAnalyzePlayer={analyzeSavedPlayer}
        />
      </div>

      <footer>
        <a href="#top" className="brand"><BrandMark /><span>MoveMirror</span></a>
        <p>Turn recent games into the next useful practice session.</p>
        <div className="footer-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="mailto:support@leglord.com">Support</a>
          <a href="#top">Analyze a player <ArrowUpRight /></a>
        </div>
      </footer>
    </main>
  )
}
