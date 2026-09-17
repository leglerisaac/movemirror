import type { AccessTier, Entitlement, SavedReport } from "./report-storage"
import type { AnalysisReport, ChessPlatform, GameFilter } from "./types"

export interface RuntimeConfig {
  products: Record<"deep" | "plus" | "coach" | "tip", boolean>
  waitlist: boolean
  weeklyReports: boolean
  supportEmail: string
}

export const EMPTY_RUNTIME_CONFIG: RuntimeConfig = {
  products: { deep: false, plus: false, coach: false, tip: false },
  waitlist: false,
  weeklyReports: false,
  supportEmail: "support@leglord.com",
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  })
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`)
  return payload
}

export async function loadRuntimeConfig() {
  try {
    return await api<RuntimeConfig>("/api/config")
  } catch {
    return EMPTY_RUNTIME_CONFIG
  }
}

export async function startCheckout(input: {
  product: "deep" | "plus" | "coach" | "tip"
  email?: string
  platform?: ChessPlatform
  username?: string
  filter?: GameFilter
  tipAmount?: number
}) {
  const result = await api<{ url: string }>("/api/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  })
  window.location.assign(result.url)
}

export function fetchEntitlement(sessionId: string) {
  return api<Omit<Entitlement, "sessionId"> & { tier: AccessTier }>(
    `/api/entitlement?session_id=${encodeURIComponent(sessionId)}`,
  )
}

export function joinInterestList(input: {
  email: string
  product: "deep" | "plus" | "coach"
  note?: string
}) {
  return api<{ ok: boolean }>("/api/interest", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function saveRemoteReport(sessionId: string, report: AnalysisReport) {
  return api<{ ok: boolean }>("/api/reports", {
    method: "POST",
    body: JSON.stringify({ sessionId, report }),
  })
}

export async function loadRemoteReports(sessionId: string) {
  return api<{ reports: SavedReport[] }>(
    `/api/reports?session_id=${encodeURIComponent(sessionId)}`,
  )
}

export function deleteRemoteReport(sessionId: string, reportId: number) {
  return api<{ ok: boolean }>("/api/reports", {
    method: "DELETE",
    body: JSON.stringify({ sessionId, reportId }),
  })
}

export function setWeeklyMonitor(input: {
  sessionId: string
  platform: ChessPlatform
  username: string
  filter: GameFilter
  enabled: boolean
}) {
  return api<{ ok: boolean; enabled: boolean }>("/api/monitor", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function openBillingPortal(sessionId: string) {
  const result = await api<{ url: string }>("/api/portal", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  })
  window.location.assign(result.url)
}

export function trackEvent(input: {
  event: string
  platform?: ChessPlatform
  product?: string
  gameCount?: number
}) {
  if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return
  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => undefined)
}
