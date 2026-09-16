# MoveMirror

MoveMirror turns a Chess.com or Lichess username and a recent-game sample into a practical training report. It replays each public PGN in the browser, summarizes the player's strongest and weakest signals, and ranks three puzzle categories to practice next.

## What it reports

- Win/draw/loss score, average rating, opponent rating, and available platform-provided accuracy
- Performance by color and time class
- Opening stability, development, castling, middlegame material stability, and endgame results
- Pattern-based signals for loose pieces, forks/double attacks, pins/skewers, back-rank mates, timeouts, advantage conversion, and resilience
- Most-played openings and an auditable recent-games table
- Three ranked puzzle themes with a concrete weekly practice dose

## Analysis approach

MoveMirror uses Chess.com's read-only [Published-Data API](https://www.chess.com/news/view/published-data-api) and Lichess's public [game export API](https://lichess.org/api#tag/Games/operation/apiGamesUser). The app only analyzes standard chess. Chess.com samples can be filtered by rapid, blitz, bullet, or daily; Lichess samples also support UltraBullet, classical, and correspondence.

This is a pattern analyzer, not a replacement for engine review. It does not run Stockfish or claim that a move is definitively a blunder. Instead, it detects explainable board signals such as persistent material drops, an undefended piece captured on the next move, double attacks against valuable targets, and vulnerable piece line-ups. Existing accuracy is displayed when the selected platform provides it.

Chess.com updated its puzzle-theme taxonomy in September 2026. Recommendations therefore use durable, plain-language categories and send users to [Custom Puzzles](https://www.chess.com/puzzles/learning) to select the closest current theme.

For Lichess reports, each recommendation links directly to the closest matching [Lichess puzzle theme](https://lichess.org/training/themes), such as hanging pieces, forks, defensive moves, or endgames.

## Privacy

No account connection, password, database, or analytics service is used. Public game data is fetched and analyzed in the visitor's browser and is not saved by MoveMirror.

## Local development

Requirements: Node.js 22.13+ and pnpm 11.

```bash
pnpm install
pnpm dev
```

Then open the local URL printed by the development server.

## Validation

```bash
pnpm exec tsc --noEmit
pnpm test:smoke
pnpm build
```

The deterministic smoke test exercises both API adapters and verifies that each produces a complete report with mapped Lichess puzzle themes.

## GitHub Pages

The included workflow builds a static export, prepares its project-site asset paths, and deploys `dist/client` on every push to `main`. The production build automatically prefixes static assets with `/movemirror` for the `leglerisaac/movemirror` project Pages site.

If you rename the repository, update the production `assetPrefix` in `next.config.ts` and `assetRoot` in `app/layout.tsx`.

## Stack

- React 19 + TypeScript
- Next-compatible app structure built with Vinext/Vite
- [`chess.js`](https://github.com/jhlywa/chess.js) for legal PGN replay and board inspection
- Chess.com PubAPI and Lichess API for public profiles and games

MoveMirror is an independent project and is not affiliated with or endorsed by Chess.com or Lichess.
