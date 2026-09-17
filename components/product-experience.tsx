"use client"

import {
  ArrowRight,
  Check,
  Clipboard,
  Crown,
  Download,
  ExternalLink,
  Gauge,
  GraduationCap,
  Heart,
  LineChart,
  Loader2,
  LockKeyhole,
  Mail,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react"
import { FormEvent, useEffect, useMemo, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  deleteRemoteReport,
  joinInterestList,
  openBillingPortal,
  saveRemoteReport,
  setWeeklyMonitor,
  startCheckout,
  trackEvent,
  type RuntimeConfig,
} from "@/lib/api"
import { buildDeepReport, reportSummary } from "@/lib/deep-report"
import {
  deleteSavedReport,
  previousReportFor,
  reportLimit,
  saveReport,
  type Entitlement,
  type SavedReport,
} from "@/lib/report-storage"
import {
  analyzeTrainingPositions,
  engineSupported,
  type EngineFinding,
} from "@/lib/stockfish"
import type { AnalysisReport, GameFilter, TrainingPosition } from "@/lib/types"

type Product = "deep" | "plus" | "coach"

function hasDeepAccess(entitlement: Entitlement, report: AnalysisReport) {
  if (entitlement.tier === "plus" || entitlement.tier === "coach") return true
  if (entitlement.tier !== "deep" || !entitlement.deepReport) return false
  if (typeof entitlement.deepReport.username !== "string") return false
  return (
    entitlement.deepReport.platform === report.platform &&
    entitlement.deepReport.username.toLowerCase() === report.username.toLowerCase()
  )
}

function pieceGrid(position: TrainingPosition) {
  const pieces: Record<string, string> = {
    K: "♔",
    Q: "♕",
    R: "♖",
    B: "♗",
    N: "♘",
    P: "♙",
    k: "♚",
    q: "♛",
    r: "♜",
    b: "♝",
    n: "♞",
    p: "♟",
  }
  const rows = position.fen
    .split(" ")[0]
    .split("/")
    .map((row) =>
      [...row].flatMap((value) =>
        /\d/.test(value) ? Array.from({ length: Number(value) }, () => "") : [value],
      ),
    )
  const oriented = position.color === "Black"
    ? [...rows].reverse().map((row) => [...row].reverse())
    : rows
  return oriented.flatMap((row, rank) =>
    row.map((piece, file) => ({
      id: `${rank}-${file}`,
      piece: pieces[piece] ?? "",
      dark: (rank + file) % 2 === 1,
    })),
  )
}

function PositionBoard({ position }: { position: TrainingPosition }) {
  return (
    <div className="position-board" aria-label={`Position before ${position.playedMove}`}>
      {pieceGrid(position).map((square) => (
        <span key={square.id} className={square.dark ? "dark" : "light"}>
          {square.piece}
        </span>
      ))}
    </div>
  )
}

function TrendCard({
  label,
  current,
  previous,
  lowerIsBetter = false,
  suffix = "%",
}: {
  label: string
  current: number | null
  previous: number | null
  lowerIsBetter?: boolean
  suffix?: string
}) {
  if (current === null || previous === null) return null
  const delta = Math.round((current - previous) * 10) / 10
  const better = lowerIsBetter ? delta < 0 : delta > 0
  return (
    <article className="trend-card">
      <span>{label}</span>
      <strong>{current.toFixed(1)}{suffix}</strong>
      <small className={delta === 0 ? "flat" : better ? "better" : "worse"}>
        {delta > 0 ? "+" : ""}{delta.toFixed(1)}{suffix} vs saved report
      </small>
    </article>
  )
}

export function ReportProductTools({
  report,
  filter,
  entitlement,
  config,
  savedReports,
  onSavedReportsChange,
  onRequestProduct,
}: {
  report: AnalysisReport
  filter: GameFilter
  entitlement: Entitlement
  config: RuntimeConfig
  savedReports: SavedReport[]
  onSavedReportsChange: (reports: SavedReport[]) => void
  onRequestProduct: (product: Product) => void
}) {
  const [notice, setNotice] = useState("")
  const [saving, setSaving] = useState(false)
  const [monitoring, setMonitoring] = useState(false)
  const [weeklyEnabled, setWeeklyEnabled] = useState(false)
  const [engineFindings, setEngineFindings] = useState<EngineFinding[]>([])
  const [engineProgress, setEngineProgress] = useState(0)
  const [engineError, setEngineError] = useState("")
  const [engineAvailable, setEngineAvailable] = useState(false)
  const deep = useMemo(() => buildDeepReport(report), [report])
  const unlocked = hasDeepAccess(entitlement, report)
  const previous = previousReportFor(report, savedReports)
  const previousLooseRate = previous
    ? previous.report.metrics.hangingLosses / Math.max(1, previous.report.gamesAnalyzed)
    : null
  const currentLooseRate = report.metrics.hangingLosses / Math.max(1, report.gamesAnalyzed)

  useEffect(() => {
    const update = window.setTimeout(() => setEngineAvailable(engineSupported()), 0)
    return () => window.clearTimeout(update)
  }, [])

  const copySummary = async () => {
    await navigator.clipboard.writeText(reportSummary(report))
    setNotice("Report summary copied.")
    trackEvent({ event: "report_shared", platform: report.platform, gameCount: report.gamesAnalyzed })
  }

  const printReport = () => {
    trackEvent({ event: "pdf_opened", platform: report.platform, gameCount: report.gamesAnalyzed })
    window.print()
  }

  const persistReport = async () => {
    setSaving(true)
    setNotice("")
    try {
      const reports = saveReport(report, reportLimit(entitlement.tier))
      onSavedReportsChange(reports)
      if (
        entitlement.sessionId &&
        (entitlement.tier === "plus" || entitlement.tier === "coach")
      ) {
        await saveRemoteReport(entitlement.sessionId, report)
      }
      setNotice(
        entitlement.tier === "plus" || entitlement.tier === "coach"
          ? "Report saved to this browser and your plan."
          : "Report saved in this browser. Free access keeps one report.",
      )
      trackEvent({ event: "report_saved", platform: report.platform, gameCount: report.gamesAnalyzed })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The report could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const toggleWeekly = async () => {
    if (!entitlement.sessionId || (entitlement.tier !== "plus" && entitlement.tier !== "coach")) {
      onRequestProduct("plus")
      return
    }
    setMonitoring(true)
    setNotice("")
    try {
      const next = !weeklyEnabled
      await setWeeklyMonitor({
        sessionId: entitlement.sessionId,
        platform: report.platform,
        username: report.username,
        filter,
        enabled: next,
      })
      setWeeklyEnabled(next)
      setNotice(next ? "Weekly email monitoring is on for this account." : "Weekly monitoring stopped.")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Weekly monitoring could not be changed.")
    } finally {
      setMonitoring(false)
    }
  }

  const runEngine = async () => {
    setEngineError("")
    setEngineProgress(0)
    try {
      const findings = await analyzeTrainingPositions(
        report.trainingPositions,
        (complete) => setEngineProgress(complete),
      )
      setEngineFindings(findings)
    } catch (error) {
      setEngineError(error instanceof Error ? error.message : "Engine review failed.")
    }
  }

  return (
    <>
      <section className="report-tools no-print" aria-label="Report actions">
        <div>
          <Badge variant="outline"><Crown /> {entitlement.tier === "free" ? "Free report" : `${entitlement.tier} access`}</Badge>
          <p>Save a snapshot now so the next analysis can show progress.</p>
        </div>
        <div className="report-tool-buttons">
          <Button variant="outline" onClick={persistReport} disabled={saving}>
            {saving ? <Loader2 className="spin" /> : <Save />} Save
          </Button>
          <Button variant="outline" onClick={copySummary}><Clipboard /> Copy summary</Button>
          <Button variant="outline" onClick={printReport}><Download /> Print / PDF</Button>
          <Button variant="outline" onClick={toggleWeekly} disabled={monitoring || !config.weeklyReports}>
            {monitoring ? <Loader2 className="spin" /> : <RefreshCcw />}
            {weeklyEnabled ? "Weekly on" : "Weekly email"}
          </Button>
        </div>
        {notice && <p className="tool-notice" role="status">{notice}</p>}
      </section>

      {previous && (
        <section className="report-section trend-section">
          <div className="section-heading split-heading">
            <div>
              <span className="section-kicker">Progress snapshot</span>
              <h2>What changed since you saved it</h2>
            </div>
            <p>Compared with the report saved {new Date(previous.savedAt).toLocaleDateString()}.</p>
          </div>
          <div className="trend-grid">
            <TrendCard label="Result score" current={report.record.scorePct} previous={previous.report.record.scorePct} />
            <TrendCard label="Clean openings" current={report.metrics.cleanOpeningRate} previous={previous.report.metrics.cleanOpeningRate} />
            <TrendCard label="Middlegame stability" current={report.metrics.middlegameStability} previous={previous.report.metrics.middlegameStability} />
            <TrendCard label="Loose pieces / game" current={currentLooseRate} previous={previousLooseRate} lowerIsBetter suffix="" />
          </div>
        </section>
      )}

      <section className={`report-section deep-report-section ${unlocked ? "unlocked" : "locked"}`}>
        <div className="section-heading split-heading">
          <div>
            <span className="section-kicker">Deep Improvement Report</span>
            <h2>A four-week plan built from your games</h2>
          </div>
          {unlocked ? (
            <Badge className="access-badge"><Check /> Unlocked</Badge>
          ) : (
            <Button onClick={() => onRequestProduct("deep")}><LockKeyhole /> Unlock for $7</Button>
          )}
        </div>
        <p className="deep-headline">{deep.headline}</p>
        {deep.openingLeak && (
          <article className="opening-leak">
            <span>Opening-specific leak</span>
            <h3>{deep.openingLeak.name}</h3>
            <p>{unlocked ? deep.openingLeak.detail : `${deep.openingLeak.games} recurring games identified · unlock the review prescription.`}</p>
          </article>
        )}
        <div className="plan-grid">
          {deep.plan.map((week, index) => (
            <article className={index > 0 && !unlocked ? "plan-week obscured" : "plan-week"} key={week.week}>
              <span>Week {week.week}</span>
              <h3>{week.title}</h3>
              <strong>{week.focus}</strong>
              <ul>
                {week.sessions.map((session) => <li key={session}><Check /> {session}</li>)}
              </ul>
              <p>{week.checkpoint}</p>
            </article>
          ))}
        </div>
        {!unlocked && (
          <div className="unlock-overlay no-print">
            <LockKeyhole />
            <strong>Unlock weeks 2–4, engine evidence and the full position drill set.</strong>
            <Button onClick={() => onRequestProduct("deep")}>Get this Deep Report <ArrowRight /></Button>
          </div>
        )}
      </section>

      <section className="report-section evidence-section">
        <div className="section-heading split-heading">
          <div>
            <span className="section-kicker">Evidence positions</span>
            <h2>Practice decisions from your own games</h2>
          </div>
          {unlocked && report.trainingPositions.length > 0 && (
            <Button variant="outline" onClick={runEngine} disabled={engineProgress > 0 && engineFindings.length === 0} className="no-print">
              {engineProgress > 0 && engineFindings.length === 0 ? <Loader2 className="spin" /> : <Gauge />}
              {engineFindings.length ? "Engine review complete" : "Run Stockfish review"}
            </Button>
          )}
        </div>
        {report.trainingPositions.length === 0 ? (
          <div className="evidence-empty">
            <ShieldCheck />
            <p>No high-confidence tactical evidence positions were detected in this sample. That is useful evidence too—retest with more games.</p>
          </div>
        ) : (
          <div className="evidence-grid">
            {report.trainingPositions.slice(0, unlocked ? 8 : 2).map((position) => {
              const engine = engineFindings.find((item) => item.positionId === position.id)
              return (
                <article className="evidence-card" key={position.id}>
                  <PositionBoard position={position} />
                  <div>
                    <Badge variant="outline">{position.category}</Badge>
                    <h3>Move {position.moveNumber} vs {position.opponent}</h3>
                    <p>{position.reason}</p>
                    <dl>
                      <div><dt>You played</dt><dd>{position.playedMove}</dd></div>
                      <div><dt>Reply</dt><dd>{position.opponentReply}</dd></div>
                      {engine && <div><dt>Engine prefers</dt><dd>{engine.bestMoveSan} · {engine.evaluation}</dd></div>}
                    </dl>
                    <a href={position.gameUrl} target="_blank" rel="noreferrer">Open original game <ExternalLink /></a>
                  </div>
                </article>
              )
            })}
          </div>
        )}
        {unlocked && !engineAvailable && (
          <p className="engine-note">Stockfish activates after deployment at chess.leglord.com with the included browser-security headers.</p>
        )}
        {engineError && <p className="engine-error" role="alert">{engineError}</p>}
      </section>
    </>
  )
}

const PRODUCTS = [
  {
    id: "deep" as const,
    icon: Sparkles,
    label: "Deep Report",
    price: "$7",
    cadence: "one time",
    description: "A focused plan for one account—ideal before committing to a subscription.",
    features: ["150-game sample", "8 Stockfish-reviewed positions", "Opening-specific leak", "Four-week plan", "Printable PDF"],
  },
  {
    id: "plus" as const,
    icon: LineChart,
    label: "Player Plus",
    price: "$5.99",
    cadence: "per month",
    description: "Track whether your training is changing the patterns in your games.",
    features: ["Saved report history", "Progress comparisons", "Weekly refresh email", "Deep reports included", "Manage billing in Stripe"],
  },
  {
    id: "coach" as const,
    icon: GraduationCap,
    label: "Coach",
    price: "$19",
    cadence: "per month",
    description: "Keep an evidence-backed improvement view for a small roster.",
    features: ["Up to 30 monitored players", "60 saved snapshots", "Student trend dashboard", "Weekly account refreshes", "Printable reports"],
  },
]

export function PricingSection({
  config,
  report,
  filter,
  onInterestJoined,
}: {
  config: RuntimeConfig
  report: AnalysisReport | null
  filter: GameFilter
  onInterestJoined?: () => void
}) {
  const [selected, setSelected] = useState<Product | null>(null)
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const pricingTracked = useRef(false)

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get("tip") !== "thanks") return
    const timer = window.setTimeout(
      () => setMessage("Thank you for supporting the free MoveMirror analyzer."),
      0,
    )
    url.searchParams.delete("tip")
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
    return () => window.clearTimeout(timer)
  }, [])

  const requestProduct = async (product: Product) => {
    setMessage("")
    trackEvent({ event: "checkout_started", product, platform: report?.platform, gameCount: report?.gamesAnalyzed })
    if (!config.products[product]) {
      setSelected(product)
      return
    }
    if (product === "deep" && !report) {
      setMessage("Run a free analysis first so the purchase can be tied to that player.")
      document.getElementById("top")?.scrollIntoView({ behavior: "smooth" })
      return
    }
    setBusy(true)
    try {
      await startCheckout({
        product,
        platform: report?.platform,
        username: report?.username,
        filter,
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout could not start.")
      setBusy(false)
    }
  }

  const join = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setBusy(true)
    setMessage("")
    try {
      if (config.waitlist) {
        await joinInterestList({ email, product: selected })
        setMessage("You’re on the launch list. We’ll only use this for MoveMirror updates.")
        setEmail("")
        onInterestJoined?.()
      } else {
        window.location.href = `mailto:${config.supportEmail}?subject=${encodeURIComponent(`MoveMirror ${selected} launch list`)}&body=${encodeURIComponent(`Please add ${email} to the ${selected} launch list.`)}`
        setMessage("Your email app should open with a prefilled request.")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The launch request could not be saved.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="pricing-section no-print"
      id="pricing"
      onMouseEnter={() => {
        if (pricingTracked.current) return
        pricingTracked.current = true
        trackEvent({ event: "pricing_viewed" })
      }}
    >
      <div className="pricing-heading">
        <span className="section-kicker">Go deeper when it is useful</span>
        <h2>Start free. Pay for a repeatable training system.</h2>
        <p>The free report stays useful: 30 games, strengths, weaknesses and direct puzzle themes. Paid plans add depth, history and automation.</p>
      </div>
      <div className="pricing-grid">
        {PRODUCTS.map((product, index) => {
          const Icon = product.icon
          return (
            <article className={index === 1 ? "price-card featured" : "price-card"} key={product.id}>
              {index === 1 && <Badge>Best for regular players</Badge>}
              <Icon className="price-icon" />
              <h3>{product.label}</h3>
              <div className="price"><strong>{product.price}</strong><span>{product.cadence}</span></div>
              <p>{product.description}</p>
              <ul>{product.features.map((feature) => <li key={feature}><Check /> {feature}</li>)}</ul>
              <Button variant={index === 1 ? "default" : "outline"} onClick={() => requestProduct(product.id)} disabled={busy}>
                {config.products[product.id] ? (product.id === "deep" ? "Buy Deep Report" : `Choose ${product.label}`) : "Join launch list"}
                <ArrowRight />
              </Button>
            </article>
          )
        })}
      </div>
      {selected && !config.products[selected] && (
        <form className="interest-form" onSubmit={join}>
          <div><Mail /><span><strong>Join the {PRODUCTS.find((item) => item.id === selected)?.label} list</strong><small>No newsletter—just launch and early-access updates.</small></span></div>
          <Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          <Button disabled={busy}>{busy ? <Loader2 className="spin" /> : <ArrowRight />} Join</Button>
        </form>
      )}
      {message && <p className="pricing-message" role="status">{message}</p>}
      <div className="support-row">
        <span><Heart /> Want to support the free analyzer without a plan?</span>
        <Button
          variant="ghost"
          disabled={!config.products.tip}
          onClick={() => void startCheckout({ product: "tip", tipAmount: 500 })}
        >
          Leave a $5 tip
        </Button>
      </div>
    </section>
  )
}

export function CoachDashboard({
  entitlement,
  savedReports,
  onSavedReportsChange,
  onAnalyzePlayer,
}: {
  entitlement: Entitlement
  savedReports: SavedReport[]
  onSavedReportsChange: (reports: SavedReport[]) => void
  onAnalyzePlayer: (platform: "chesscom" | "lichess", username: string) => void
}) {
  const groups = useMemo(() => {
    const map = new Map<string, SavedReport[]>()
    for (const saved of savedReports) {
      const key = `${saved.report.platform}:${saved.report.username.toLowerCase()}`
      map.set(key, [...(map.get(key) ?? []), saved])
    }
    return [...map.values()].map((items) => items.sort((a, b) => b.savedAt - a.savedAt))
  }, [savedReports])

  const removeSnapshot = async (saved: SavedReport) => {
    if (saved.id.startsWith("remote:") && entitlement.sessionId) {
      await deleteRemoteReport(entitlement.sessionId, Number(saved.id.slice("remote:".length)))
      onSavedReportsChange(savedReports.filter((item) => item.id !== saved.id))
      return
    }
    const remote = savedReports.filter((item) => item.id.startsWith("remote:"))
    onSavedReportsChange([...remote, ...deleteSavedReport(saved.id)])
  }

  return (
    <section className="coach-section no-print" id="coach">
      <div className="coach-heading">
        <div>
          <span className="section-kicker">Coach workspace</span>
          <h2>Patterns across a student roster</h2>
          <p>Save reports after each review to compare results, tactical signals and phase stability over time.</p>
        </div>
        <div className="coach-summary"><Users /><strong>{groups.length}</strong><span>players saved</span></div>
      </div>
      {entitlement.tier !== "coach" ? (
        <div className="coach-locked">
          <LockKeyhole />
          <div><h3>Coach access is ready for launch</h3><p>The production plan supports 30 monitored players, shared cloud snapshots and weekly refreshes.</p></div>
          <a href="#pricing" className="button-link">See coach pricing <ArrowRight /></a>
        </div>
      ) : groups.length === 0 ? (
        <div className="coach-empty"><Users /><h3>No students saved yet</h3><p>Analyze a student, then choose Save report. Their latest snapshot will appear here.</p></div>
      ) : (
        <div className="student-grid">
          {groups.map((reports) => {
            const latest = reports[0]
            const prior = reports[1]
            const delta = prior ? latest.report.record.scorePct - prior.report.record.scorePct : null
            return (
              <article className="student-card" key={`${latest.report.platform}:${latest.report.username}`}>
                <div className="student-topline"><Badge variant="outline">{latest.report.platform === "lichess" ? "Lichess" : "Chess.com"}</Badge><span>{reports.length} snapshots</span></div>
                <h3>@{latest.report.username}</h3>
                <div className="student-metrics"><strong>{latest.report.record.scorePct}%</strong><span>result score</span>{delta !== null && <small className={delta >= 0 ? "better" : "worse"}>{delta >= 0 ? "+" : ""}{delta.toFixed(1)} since prior</small>}</div>
                <p>Next: {latest.report.recommendations[0]?.category}</p>
                <div className="student-actions">
                  <Button variant="outline" onClick={() => onAnalyzePlayer(latest.report.platform, latest.report.username)}>Refresh <RefreshCcw /></Button>
                  <Button
                    variant="ghost"
                    aria-label={`Delete latest ${latest.report.username} snapshot`}
                    onClick={() => void removeSnapshot(latest)}
                  ><Trash2 /></Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
      {entitlement.sessionId && (entitlement.tier === "plus" || entitlement.tier === "coach") && (
        <Button variant="ghost" onClick={() => void openBillingPortal(entitlement.sessionId!)}>Manage plan in Stripe <ExternalLink /></Button>
      )}
    </section>
  )
}
