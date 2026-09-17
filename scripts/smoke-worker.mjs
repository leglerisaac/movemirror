import { createServer } from "vite"

const vite = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
})

try {
  const workerModule = await vite.ssrLoadModule("/worker/index.ts")
  const worker = workerModule.default
  const env = {
    PUBLIC_ORIGIN: "https://chess.leglord.com",
    SUPPORT_EMAIL: "support@leglord.com",
    ASSETS: {
      fetch: async () => new Response("<h1>MoveMirror</h1>", {
        headers: { "content-type": "text/html" },
      }),
    },
  }

  const configResponse = await worker.fetch(
    new Request("https://chess.leglord.com/api/config"),
    env,
  )
  const config = await configResponse.json()
  if (configResponse.status !== 200 || config.products.deep !== false) {
    throw new Error("Unconfigured checkout must be reported as disabled")
  }
  if (config.supportEmail !== "support@leglord.com") {
    throw new Error("Expected the configured support email")
  }

  const assetResponse = await worker.fetch(
    new Request("https://chess.leglord.com/"),
    env,
  )
  if (assetResponse.headers.get("Cross-Origin-Opener-Policy") !== "same-origin") {
    throw new Error("Static responses must include the Stockfish isolation headers")
  }

  const waitlistResponse = await worker.fetch(
    new Request("https://chess.leglord.com/api/interest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", product: "deep" }),
    }),
    env,
  )
  if (waitlistResponse.status !== 503) {
    throw new Error("An absent D1 binding must fail closed for waitlist writes")
  }

  console.log(JSON.stringify({
    configStatus: configResponse.status,
    checkoutEnabled: config.products,
    securityHeaders: true,
    waitlistWithoutDatabase: waitlistResponse.status,
  }, null, 2))
} finally {
  await vite.close()
}
