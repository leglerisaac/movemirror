import type { AnalysisReport, ChessPlatform } from "./types"

export type AccessTier = "free" | "deep" | "plus" | "coach"

export interface Entitlement {
  tier: AccessTier
  sessionId?: string
  email?: string
  deepReport?: {
    platform: ChessPlatform
    username: string
    filter: string
    gameCount: number
  }
}

export interface SavedReport {
  id: string
  savedAt: number
  report: AnalysisReport
}

const REPORTS_KEY = "movemirror.saved-reports.v1"
const ENTITLEMENT_KEY = "movemirror.entitlement.v1"

function browserStorage() {
  return typeof window === "undefined" ? null : window.localStorage
}

export function readSavedReports(): SavedReport[] {
  const storage = browserStorage()
  if (!storage) return []
  try {
    const value = JSON.parse(storage.getItem(REPORTS_KEY) ?? "[]") as SavedReport[]
    return Array.isArray(value)
      ? value.filter((item) => item?.report?.username && Number.isFinite(item.savedAt))
      : []
  } catch {
    return []
  }
}

export function saveReport(report: AnalysisReport, limit: number) {
  const storage = browserStorage()
  if (!storage) return []
  const next: SavedReport = {
    id: `${report.platform}:${report.username.toLowerCase()}:${Date.now()}`,
    savedAt: Date.now(),
    report,
  }
  const reports = [next, ...readSavedReports()]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, limit)
  storage.setItem(REPORTS_KEY, JSON.stringify(reports))
  return reports
}

export function deleteSavedReport(id: string) {
  const storage = browserStorage()
  if (!storage) return []
  const reports = readSavedReports().filter((item) => item.id !== id)
  storage.setItem(REPORTS_KEY, JSON.stringify(reports))
  return reports
}

export function previousReportFor(report: AnalysisReport, reports: SavedReport[]) {
  return reports.find(
    (item) =>
      item.report.platform === report.platform &&
      item.report.username.toLowerCase() === report.username.toLowerCase() &&
      item.report.dateTo < report.dateTo,
  )
}

export function readEntitlement(): Entitlement {
  const storage = browserStorage()
  if (!storage) return { tier: "free" }
  try {
    const value = JSON.parse(storage.getItem(ENTITLEMENT_KEY) ?? "{}") as Entitlement
    if (!value || !["free", "deep", "plus", "coach"].includes(value.tier)) {
      return { tier: "free" }
    }
    if (
      value.tier === "deep" &&
      (!value.deepReport ||
        typeof value.deepReport.username !== "string" ||
        (value.deepReport.platform !== "chesscom" && value.deepReport.platform !== "lichess"))
    ) {
      return { tier: "free" }
    }
    return value
  } catch {
    return { tier: "free" }
  }
}

export function saveEntitlement(entitlement: Entitlement) {
  browserStorage()?.setItem(ENTITLEMENT_KEY, JSON.stringify(entitlement))
}

export function reportLimit(tier: AccessTier) {
  if (tier === "coach") return 60
  if (tier === "plus") return 20
  return 1
}
