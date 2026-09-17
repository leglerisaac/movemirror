import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy — MoveMirror",
  description: "How MoveMirror handles chess account data, saved reports, payments and analytics.",
}

export const dynamic = "force-static"

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link href="/" className="legal-brand">← MoveMirror</Link>
      <article>
        <span className="section-kicker">Effective September 17, 2026</span>
        <h1>Privacy Policy</h1>
        <p className="legal-lede">
          MoveMirror is designed so a free analysis happens in your browser. You do not
          provide a Chess.com or Lichess password, and MoveMirror only reads public game data.
        </p>

        <h2>Data used for an analysis</h2>
        <p>
          When you enter a username, your browser requests that account&apos;s public profile and
          games from Chess.com or Lichess. The free report is calculated on your device. We do
          not receive the username or PGNs through our analytics endpoint.
        </p>

        <h2>Local saves</h2>
        <p>
          If you choose Save, a report is stored in your browser&apos;s local storage. You can
          clear it through your browser settings. Clearing site data also removes the locally
          saved access token used to recognize a purchase on that browser.
        </p>

        <h2>Paid and cloud features</h2>
        <p>
          Stripe processes checkout and subscription billing. For a one-time Deep Report, the
          selected public username, platform and game filter are attached to the Stripe checkout
          so the correct report can be unlocked. If you enable cloud history or weekly reports,
          we store your Stripe customer identifier, email address, selected public chess accounts
          and generated report snapshots in Cloudflare D1.
        </p>

        <h2>Email delivery</h2>
        <p>
          Weekly reports are optional and are sent through Resend. Each weekly message includes
          a link that removes that monitored chess account. Turning off a monitored account does
          not cancel a Stripe subscription.
        </p>

        <h2>Minimal product analytics</h2>
        <p>
          MoveMirror may record events such as an analysis completing, a puzzle link being opened
          or checkout starting. Those events can include platform, product and a broad game-count
          range, but not the chess username or PGN. The analytics request is skipped when your
          browser sends Do Not Track.
        </p>

        <h2>Service providers and retention</h2>
        <p>
          Public chess data comes from Chess.com or Lichess. Hosting and storage use Cloudflare,
          payments use Stripe, and optional email uses Resend. Billing records are kept as required
          for accounting and legal obligations. Saved reports and monitored accounts remain until
          you delete them, stop the feature, or ask us to remove them.
        </p>

        <h2>Your choices</h2>
        <p>
          You can use the free analyzer without an account, decline saving, disable weekly email,
          clear local site data, or request deletion of cloud report data. Contact
          {" "}<a href="mailto:support@leglord.com">support@leglord.com</a> for access or deletion
          requests. We may need to verify the Stripe customer connected to the request.
        </p>

        <h2>Changes</h2>
        <p>
          Material changes will be posted here with a revised effective date. MoveMirror is an
          independent service and is not affiliated with or endorsed by Chess.com or Lichess.
        </p>
      </article>
    </main>
  )
}
