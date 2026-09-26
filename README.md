# MoveMirror

MoveMirror turns a Chess.com or Lichess username and a recent-game sample into a practical training report. It replays each public PGN in the browser, summarizes the player's strongest and weakest signals, and ranks three puzzle categories to practice next. The production target is [chess.leglord.com](https://chess.leglord.com).

## What it reports

- Win/draw/loss score, average rating, opponent rating, and available platform-provided accuracy
- Performance by color and time class
- Opening stability, development, castling, middlegame material stability, and endgame results
- Pattern-based signals for loose pieces, forks/double attacks, pins/skewers, back-rank mates, timeouts, advantage conversion, and resilience
- Most-played openings and an auditable recent-games table
- Three ranked puzzle themes with a concrete weekly practice dose
- Evidence positions captured from the player's own decisions
- Local Stockfish analysis of up to 200 decisions across eight recent games
- Engine-derived precision, average centipawn loss, phase splits and ranked critical moments
- A generated four-week training plan and opening-specific leak
- Printable/PDF reports, copied summaries, local snapshots, and trend comparisons
- Player Plus weekly refreshes and a coach roster dashboard

## Product tiers

- **Free:** up to 30 games, core findings, phase metrics and puzzle links
- **Deep Report ($7 once):** 150-game pattern sample, full four-week plan and Stockfish analysis of up to 200 decisions across eight recent games
- **Player Plus ($5.99/month):** saved history, progress comparisons and one weekly monitored account
- **Coach ($19/month):** up to 30 monitored accounts and 60 cloud report snapshots

Checkout is deliberately disabled until Stripe price IDs and a secret key are configured. When checkout is unavailable, the pricing cards collect launch interest through D1 (or open a prefilled support email before D1 is connected).

## Analysis approach

MoveMirror uses Chess.com's read-only [Published-Data API](https://www.chess.com/news/view/published-data-api) and Lichess's public [game export API](https://lichess.org/api#tag/Games/operation/apiGamesUser). The app only analyzes standard chess. Chess.com samples can be filtered by rapid, blitz, bullet, or daily; Lichess samples also support UltraBullet, classical, and correspondence.

The free report is an explainable pattern analyzer. It detects signals such as persistent material drops, an undefended piece captured on the next move, double attacks, and vulnerable piece line-ups. Existing accuracy is displayed when the selected platform provides it. A paid Deep Report can run Stockfish locally across up to 200 player decisions from eight recent games. It calculates a move-quality index, average centipawn loss, phase performance, mistakes, blunders and critical positions, then uses the confirmed misses to refine the report's strengths, weaknesses and puzzle queue. The engine runs in a Web Worker and never uploads positions to MoveMirror.

Chess.com updated its puzzle-theme taxonomy in September 2026. Recommendations therefore use durable, plain-language categories and send users to [Custom Puzzles](https://www.chess.com/puzzles/learning) to select the closest current theme.

For Lichess reports, each recommendation links directly to the closest matching [Lichess puzzle theme](https://lichess.org/training/themes), such as hanging pieces, forks, defensive moves, or endgames.

## Privacy

No chess-account connection or password is used. Free public game data is fetched and analyzed in the visitor's browser. Reports are only saved when the visitor chooses Save or enables a paid cloud/weekly feature. Aggregate analytics omit usernames and PGNs and honor Do Not Track. See the in-product Privacy Policy for full details.

## Local development

Requirements: Node.js 22.13+ and pnpm 11.

```bash
pnpm install
pnpm dev
```

Then open the local URL printed by the development server.

The normal app dev server exercises the browser analyzer. To test the Cloudflare API, build first and run the Worker:

```bash
pnpm build
pnpm exec wrangler dev --config wrangler.jsonc
```

## Validation

```bash
pnpm exec tsc --noEmit
pnpm test:smoke
pnpm build
```

The deterministic smoke test exercises both API adapters and verifies that each produces a complete report with mapped Lichess puzzle themes.

## Deployment

GitHub Pages is no longer the production target because GitHub does not permit it to run a commercial SaaS. A Cloudflare Worker serves the static export and the small API used for Stripe, D1 storage, analytics and weekly jobs. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the account setup, secrets, database migration, custom domain and test-checkout checklist.

## Stack

- React 19 + TypeScript
- Next-compatible app structure built with Vinext/Vite
- [`chess.js`](https://github.com/jhlywa/chess.js) for legal PGN replay and board inspection
- [Stockfish.js 19](https://github.com/nmrugg/stockfish.js) lite NNUE for private in-browser engine analysis (GPLv3)
- Chess.com PubAPI and Lichess API for public profiles and games
- Cloudflare Workers, static assets, Cron Triggers and D1
- Stripe Checkout and Billing Portal
- Resend for optional weekly email

MoveMirror is an independent project and is not affiliated with or endorsed by Chess.com or Lichess.
