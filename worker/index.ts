import { analyzeGames } from "../lib/analyze"
import { fetchRecentGames as fetchRecentChessComGames } from "../lib/chesscom"
import { fetchRecentLichessGames } from "../lib/lichess"
import type { AnalysisReport, ChessPlatform, GameFilter } from "../lib/types"

interface Env {
  ASSETS: Fetcher
  DB?: D1Database
  PUBLIC_ORIGIN?: string
  SUPPORT_EMAIL?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_DEEP_PRICE_ID?: string
  STRIPE_PLUS_PRICE_ID?: string
  STRIPE_COACH_PRICE_ID?: string
  RESEND_API_KEY?: string
  REPORT_FROM_EMAIL?: string
}

type Product = "deep" | "plus" | "coach" | "tip"

interface StripeSession {
  id: string
  status?: string
  mode?: "payment" | "subscription"
  payment_status?: string
  customer?: string | { id?: string }
  subscription?: string | { id?: string; status?: string }
  customer_details?: { email?: string }
  metadata?: Record<string, string>
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
}

const SECURITY_HEADERS = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}

const ANALYTICS_EVENTS = new Set([
  "analysis_started",
  "analysis_completed",
  "analysis_failed",
  "puzzle_clicked",
  "report_saved",
  "report_shared",
  "pdf_opened",
  "pricing_viewed",
  "checkout_started",
])

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS })
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS },
  })
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

async function bodyJson<T>(request: Request): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (contentLength > 300_000) throw new Error("Request body is too large.")
  return (await request.json()) as T
}

function originFor(request: Request, env: Env) {
  return (env.PUBLIC_ORIGIN || new URL(request.url).origin).replace(/\/$/, "")
}

function priceFor(product: Product, env: Env) {
  if (product === "deep") return env.STRIPE_DEEP_PRICE_ID
  if (product === "plus") return env.STRIPE_PLUS_PRICE_ID
  if (product === "coach") return env.STRIPE_COACH_PRICE_ID
  return undefined
}

async function stripeRequest<T>(
  env: Env,
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Payments are not configured yet.")
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(init?.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...init?.headers,
    },
  })
  const payload = (await response.json()) as T & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message || `Stripe returned ${response.status}.`)
  }
  return payload
}

function stripeId(value: string | { id?: string } | undefined) {
  return typeof value === "string" ? value : value?.id
}

async function getSession(env: Env, sessionId: string) {
  if (!/^cs_(test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) {
    throw new Error("Invalid checkout session.")
  }
  return stripeRequest<StripeSession>(
    env,
    `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`,
  )
}

function sessionTier(session: StripeSession): Product | null {
  const product = session.metadata?.product
  if (product !== "deep" && product !== "plus" && product !== "coach" && product !== "tip") {
    return null
  }
  if (session.status !== "complete") return null
  if (session.mode === "payment") {
    return session.payment_status === "paid" ? product : null
  }
  const subscription = session.subscription
  const status = typeof subscription === "object" ? subscription.status : undefined
  return status === "active" || status === "trialing" ? product : null
}

function entitlementPayload(session: StripeSession) {
  const tier = sessionTier(session)
  if (!tier) throw new Error("This checkout is not active or paid.")
  return {
    tier,
    email: session.customer_details?.email,
    deepReport:
      tier === "deep"
        ? {
            platform: session.metadata?.platform,
            username: session.metadata?.username,
            filter: session.metadata?.filter || "all",
            gameCount: Number(session.metadata?.game_count || 150),
          }
        : undefined,
  }
}

async function createCheckout(request: Request, env: Env) {
  const body = await bodyJson<{
    product?: Product
    email?: string
    platform?: ChessPlatform
    username?: string
    filter?: string
    tipAmount?: number
  }>(request)
  const product = body.product
  if (!product || !["deep", "plus", "coach", "tip"].includes(product)) {
    return json({ error: "Choose a valid product." }, 400)
  }

  const origin = originFor(request, env)
  const params = new URLSearchParams({
    mode: product === "plus" || product === "coach" ? "subscription" : "payment",
    success_url:
      product === "tip"
        ? `${origin}/?tip=thanks#pricing`
        : `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancelled#pricing`,
    "metadata[product]": product,
    allow_promotion_codes: "true",
  })

  if (body.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    params.set("customer_email", body.email)
  }

  if (product === "tip") {
    const amount = [300, 500, 1000].includes(Number(body.tipAmount))
      ? Number(body.tipAmount)
      : 500
    params.set("line_items[0][price_data][currency]", "usd")
    params.set("line_items[0][price_data][unit_amount]", String(amount))
    params.set("line_items[0][price_data][product_data][name]", "Support MoveMirror")
    params.set("line_items[0][quantity]", "1")
  } else {
    const price = priceFor(product, env)
    if (!price) return json({ error: `${product} checkout is not configured yet.` }, 503)
    params.set("line_items[0][price]", price)
    params.set("line_items[0][quantity]", "1")
  }

  if (product === "deep") {
    const username = String(body.username ?? "").trim()
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(username)) {
      return json({ error: "Run an analysis before purchasing a Deep Report." }, 400)
    }
    if (body.platform !== "chesscom" && body.platform !== "lichess") {
      return json({ error: "Choose Chess.com or Lichess." }, 400)
    }
    params.set("metadata[username]", username)
    params.set("metadata[platform]", body.platform)
    params.set("metadata[filter]", String(body.filter || "all"))
    params.set("metadata[game_count]", "150")
  }

  const session = await stripeRequest<{ url: string }>(env, "/checkout/sessions", {
    method: "POST",
    body: params,
  })
  return json({ url: session.url })
}

async function verifyEntitlement(request: Request, env: Env) {
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? ""
  const session = await getSession(env, sessionId)
  return json(entitlementPayload(session))
}

async function createPortal(request: Request, env: Env) {
  const { sessionId } = await bodyJson<{ sessionId?: string }>(request)
  const session = await getSession(env, sessionId ?? "")
  if (!sessionTier(session)) return json({ error: "No active purchase was found." }, 403)
  const customer = stripeId(session.customer)
  if (!customer) return json({ error: "This purchase does not have a customer portal." }, 400)
  const params = new URLSearchParams({
    customer,
    return_url: originFor(request, env),
  })
  const portal = await stripeRequest<{ url: string }>(env, "/billing_portal/sessions", {
    method: "POST",
    body: params,
  })
  return json({ url: portal.url })
}

async function captureInterest(request: Request, env: Env) {
  if (!env.DB) return json({ error: "The waitlist database is not configured yet." }, 503)
  const body = await bodyJson<{ email?: string; product?: string; note?: string }>(request)
  const email = String(body.email ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Enter a valid email address." }, 400)
  }
  const product = ["deep", "plus", "coach"].includes(String(body.product))
    ? String(body.product)
    : "general"
  const note = String(body.note ?? "").trim().slice(0, 500)
  await env.DB.prepare(
    "INSERT INTO interests (email, product, note, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email, product) DO UPDATE SET note = excluded.note, created_at = excluded.created_at",
  )
    .bind(email, product, note, Date.now())
    .run()
  return json({ ok: true })
}

async function captureEvent(request: Request, env: Env) {
  if (!env.DB) return new Response(null, { status: 204 })
  const body = await bodyJson<{
    event?: string
    platform?: string
    product?: string
    gameCount?: number
  }>(request)
  const event = String(body.event ?? "")
  if (!ANALYTICS_EVENTS.has(event)) return json({ error: "Unknown event." }, 400)
  const platform = body.platform === "lichess" || body.platform === "chesscom" ? body.platform : null
  const product = ["deep", "plus", "coach", "tip"].includes(String(body.product))
    ? String(body.product)
    : null
  const count = Number(body.gameCount)
  const gameBucket = Number.isFinite(count)
    ? count <= 10
      ? "5-10"
      : count <= 30
        ? "11-30"
        : count <= 100
          ? "31-100"
          : "101-200"
    : null
  await env.DB.prepare(
    "INSERT INTO analytics_events (event, platform, product, game_bucket, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(event, platform, product, gameBucket, Date.now())
    .run()
  return new Response(null, { status: 204 })
}

async function subscriberSession(env: Env, sessionId: string) {
  const session = await getSession(env, sessionId)
  const tier = sessionTier(session)
  if (tier !== "plus" && tier !== "coach") {
    throw new Error("An active Player Plus or Coach plan is required.")
  }
  const customerId = stripeId(session.customer)
  if (!customerId) throw new Error("No Stripe customer was found for this plan.")
  return { session, tier, customerId }
}

function validReport(value: unknown): value is AnalysisReport {
  if (!value || typeof value !== "object") return false
  const report = value as Partial<AnalysisReport>
  return (
    (report.platform === "chesscom" || report.platform === "lichess") &&
    typeof report.username === "string" &&
    report.username.length >= 2 &&
    typeof report.gamesAnalyzed === "number" &&
    Array.isArray(report.strengths) &&
    Array.isArray(report.weaknesses) &&
    Array.isArray(report.recommendations)
  )
}

async function saveRemoteReport(request: Request, env: Env) {
  if (!env.DB) return json({ error: "Report storage is not configured yet." }, 503)
  const { sessionId, report } = await bodyJson<{
    sessionId?: string
    report?: AnalysisReport
  }>(request)
  if (!validReport(report)) return json({ error: "The report payload is invalid." }, 400)
  const serialized = JSON.stringify(report)
  if (serialized.length > 250_000) return json({ error: "The report is too large to save." }, 413)
  const { tier, customerId } = await subscriberSession(env, sessionId ?? "")
  const limit = tier === "coach" ? 60 : 20
  const current = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM report_snapshots WHERE customer_id = ?",
  )
    .bind(customerId)
    .first<{ count: number }>()
  if (Number(current?.count ?? 0) >= limit) {
    await env.DB.prepare(
      "DELETE FROM report_snapshots WHERE id IN (SELECT id FROM report_snapshots WHERE customer_id = ? ORDER BY created_at ASC LIMIT 1)",
    )
      .bind(customerId)
      .run()
  }
  await env.DB.prepare(
    "INSERT INTO report_snapshots (customer_id, platform, username, report_json, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(customerId, report.platform, report.username, serialized, Date.now())
    .run()
  return json({ ok: true })
}

async function listRemoteReports(request: Request, env: Env) {
  if (!env.DB) return json({ reports: [] })
  const sessionId = new URL(request.url).searchParams.get("session_id") ?? ""
  const { tier, customerId } = await subscriberSession(env, sessionId)
  const limit = tier === "coach" ? 60 : 20
  const rows = await env.DB.prepare(
    "SELECT id, report_json, created_at FROM report_snapshots WHERE customer_id = ? ORDER BY created_at DESC LIMIT ?",
  )
    .bind(customerId, limit)
    .all<{ id: number; report_json: string; created_at: number }>()
  const reports = (rows.results ?? []).flatMap((row) => {
    try {
      return [{ id: `remote:${row.id}`, savedAt: row.created_at, report: JSON.parse(row.report_json) }]
    } catch {
      return []
    }
  })
  return json({ reports })
}

async function deleteRemoteReport(request: Request, env: Env) {
  if (!env.DB) return json({ error: "Report storage is not configured yet." }, 503)
  const { sessionId, reportId } = await bodyJson<{ sessionId?: string; reportId?: number }>(request)
  const id = Number(reportId)
  if (!Number.isInteger(id) || id < 1) return json({ error: "Invalid report ID." }, 400)
  const { customerId } = await subscriberSession(env, sessionId ?? "")
  await env.DB.prepare("DELETE FROM report_snapshots WHERE id = ? AND customer_id = ?")
    .bind(id, customerId)
    .run()
  return json({ ok: true })
}

async function configureMonitor(request: Request, env: Env) {
  if (!env.DB) return json({ error: "Weekly monitoring is not configured yet." }, 503)
  const body = await bodyJson<{
    sessionId?: string
    platform?: ChessPlatform
    username?: string
    filter?: GameFilter
    enabled?: boolean
  }>(request)
  const { session, tier, customerId } = await subscriberSession(env, body.sessionId ?? "")
  const username = String(body.username ?? "").trim()
  if (!/^[a-zA-Z0-9_-]{2,30}$/.test(username)) {
    return json({ error: "Enter a valid chess username." }, 400)
  }
  if (body.platform !== "chesscom" && body.platform !== "lichess") {
    return json({ error: "Choose Chess.com or Lichess." }, 400)
  }
  const filter = String(body.filter || "all")
  const email = session.customer_details?.email
  if (!email) return json({ error: "Stripe did not return an email for this plan." }, 400)

  if (body.enabled === false) {
    await env.DB.prepare(
      "DELETE FROM monitored_accounts WHERE customer_id = ? AND platform = ? AND lower(username) = lower(?)",
    )
      .bind(customerId, body.platform, username)
      .run()
    return json({ ok: true, enabled: false })
  }

  const existing = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM monitored_accounts WHERE customer_id = ?",
  )
    .bind(customerId)
    .first<{ count: number }>()
  const limit = tier === "coach" ? 30 : 1
  const alreadyMonitored = await env.DB.prepare(
    "SELECT id FROM monitored_accounts WHERE customer_id = ? AND platform = ? AND lower(username) = lower(?)",
  )
    .bind(customerId, body.platform, username)
    .first()
  if (!alreadyMonitored && Number(existing?.count ?? 0) >= limit) {
    return json({ error: `${tier === "coach" ? "Coach" : "Player Plus"} allows ${limit} monitored ${limit === 1 ? "account" : "accounts"}.` }, 409)
  }

  const token = crypto.randomUUID()
  await env.DB.prepare(
    "INSERT INTO monitored_accounts (customer_id, session_id, email, platform, username, game_filter, game_count, unsubscribe_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(customer_id, platform, username) DO UPDATE SET session_id = excluded.session_id, email = excluded.email, game_filter = excluded.game_filter",
  )
    .bind(customerId, body.sessionId, email, body.platform, username, filter, 60, token, Date.now())
    .run()
  return json({ ok: true, enabled: true })
}

async function deleteCustomerData(request: Request, env: Env) {
  if (!env.DB) return json({ ok: true })
  const { sessionId } = await bodyJson<{ sessionId?: string }>(request)
  const { customerId } = await subscriberSession(env, sessionId ?? "")
  await env.DB.batch([
    env.DB.prepare("DELETE FROM monitored_accounts WHERE customer_id = ?").bind(customerId),
    env.DB.prepare("DELETE FROM report_snapshots WHERE customer_id = ?").bind(customerId),
  ])
  return json({ ok: true })
}

async function unsubscribe(request: Request, env: Env) {
  const token = new URL(request.url).searchParams.get("token") ?? ""
  if (!env.DB || !/^[0-9a-f-]{36}$/i.test(token)) {
    return html("<h1>Invalid unsubscribe link</h1>", 400)
  }
  await env.DB.prepare("DELETE FROM monitored_accounts WHERE unsubscribe_token = ?")
    .bind(token)
    .run()
  return html("<main style=\"font-family:system-ui;max-width:38rem;margin:12vh auto;padding:2rem\"><h1>Weekly reports stopped</h1><p>This monitored account has been removed. Your Stripe subscription was not changed.</p><a href=\"/\">Return to MoveMirror</a></main>")
}

interface MonitorRow {
  id: number
  customer_id: string
  session_id: string
  email: string
  platform: ChessPlatform
  username: string
  game_filter: GameFilter
  game_count: number
  unsubscribe_token: string
}

async function sendWeeklyEmail(env: Env, row: MonitorRow, report: AnalysisReport) {
  if (!env.RESEND_API_KEY || !env.REPORT_FROM_EMAIL) return
  const origin = (env.PUBLIC_ORIGIN || "https://chess.leglord.com").replace(/\/$/, "")
  const top = report.recommendations[0]
  const unsubscribeUrl = `${origin}/api/monitor/unsubscribe?token=${encodeURIComponent(row.unsubscribe_token)}`
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.REPORT_FROM_EMAIL,
      to: [row.email],
      subject: `MoveMirror weekly read for ${report.username}`,
      html: `<div style="font-family:system-ui;max-width:620px;margin:auto"><h1>Your games point to ${escapeHtml(top.category)}</h1><p>MoveMirror reviewed ${report.gamesAnalyzed} recent games. Your result score was <strong>${report.record.scorePct}%</strong>.</p><h2>Start here</h2><p>${escapeHtml(top.reason)}</p><p><strong>${escapeHtml(top.practice)}</strong></p><p><a href="${origin}">Open MoveMirror</a></p><hr><p style="font-size:12px;color:#666"><a href="${unsubscribeUrl}">Stop weekly reports for this account</a></p></div>`,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
    }),
  })
  if (!response.ok) throw new Error(`Email delivery returned ${response.status}.`)
}

async function refreshMonitors(env: Env) {
  if (!env.DB) return
  const rows = await env.DB.prepare(
    "SELECT id, customer_id, session_id, email, platform, username, game_filter, game_count, unsubscribe_token FROM monitored_accounts ORDER BY COALESCE(last_run_at, 0) ASC LIMIT 50",
  ).all<MonitorRow>()

  for (const row of rows.results ?? []) {
    try {
      await subscriberSession(env, row.session_id)
      const fetchGames = row.platform === "lichess" ? fetchRecentLichessGames : fetchRecentChessComGames
      const result = await fetchGames({
        username: row.username,
        count: row.game_count,
        filter: row.game_filter,
      })
      const report = analyzeGames(
        result.profile.username,
        result.games,
        row.game_count,
        row.platform,
      )
      await env.DB.prepare(
        "INSERT INTO report_snapshots (customer_id, platform, username, report_json, created_at) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(row.customer_id, report.platform, report.username, JSON.stringify(report), Date.now())
        .run()
      await sendWeeklyEmail(env, row, report)
      await env.DB.prepare(
        "UPDATE monitored_accounts SET last_run_at = ?, last_error = NULL WHERE id = ?",
      )
        .bind(Date.now(), row.id)
        .run()
    } catch (error) {
      await env.DB.prepare(
        "UPDATE monitored_accounts SET last_run_at = ?, last_error = ? WHERE id = ?",
      )
        .bind(Date.now(), error instanceof Error ? error.message.slice(0, 300) : "Unknown error", row.id)
        .run()
    }
  }
}

async function handleApi(request: Request, env: Env) {
  const url = new URL(request.url)
  if (request.method === "GET" && url.pathname === "/api/config") {
    return json({
      products: {
        deep: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_DEEP_PRICE_ID),
        plus: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PLUS_PRICE_ID),
        coach: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_COACH_PRICE_ID),
        tip: Boolean(env.STRIPE_SECRET_KEY),
      },
      waitlist: Boolean(env.DB),
      weeklyReports: Boolean(env.DB && env.RESEND_API_KEY && env.REPORT_FROM_EMAIL),
      supportEmail: env.SUPPORT_EMAIL || "support@leglord.com",
    })
  }
  if (request.method === "POST" && url.pathname === "/api/checkout") return createCheckout(request, env)
  if (request.method === "GET" && url.pathname === "/api/entitlement") return verifyEntitlement(request, env)
  if (request.method === "POST" && url.pathname === "/api/portal") return createPortal(request, env)
  if (request.method === "POST" && url.pathname === "/api/interest") return captureInterest(request, env)
  if (request.method === "POST" && url.pathname === "/api/events") return captureEvent(request, env)
  if (request.method === "POST" && url.pathname === "/api/reports") return saveRemoteReport(request, env)
  if (request.method === "GET" && url.pathname === "/api/reports") return listRemoteReports(request, env)
  if (request.method === "DELETE" && url.pathname === "/api/reports") return deleteRemoteReport(request, env)
  if (request.method === "POST" && url.pathname === "/api/monitor") return configureMonitor(request, env)
  if (request.method === "GET" && url.pathname === "/api/monitor/unsubscribe") return unsubscribe(request, env)
  if (request.method === "POST" && url.pathname === "/api/data/delete") return deleteCustomerData(request, env)
  return json({ error: "Not found." }, 404)
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env)
      const response = await env.ASSETS.fetch(request)
      const headers = new Headers(response.headers)
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value)
      if (url.pathname.endsWith(".wasm")) headers.set("content-type", "application/wasm")
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500)
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext) {
    context.waitUntil(refreshMonitors(env))
  },
}

export default worker
