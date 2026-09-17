import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service — MoveMirror",
  description: "Terms governing use of the MoveMirror chess improvement service.",
}

export const dynamic = "force-static"

export default function TermsPage() {
  return (
    <main className="legal-page">
      <Link href="/" className="legal-brand">← MoveMirror</Link>
      <article>
        <span className="section-kicker">Effective September 17, 2026</span>
        <h1>Terms of Service</h1>
        <p className="legal-lede">
          These terms apply when you use MoveMirror. By using the service, you agree to them.
        </p>

        <h2>The service</h2>
        <p>
          MoveMirror analyzes public Chess.com and Lichess games to surface training patterns.
          Its findings are educational estimates, not official platform accuracy scores or a
          guarantee of rating improvement. Pattern labels can be wrong and should be checked
          against the original game and, where available, engine review.
        </p>

        <h2>Acceptable use</h2>
        <p>
          Use MoveMirror only for lawful analysis of public chess data. Do not disrupt the service,
          bypass product limits, scrape it at scale, probe other customers&apos; purchase tokens, or use
          it in a way that violates Chess.com, Lichess, Stripe or Cloudflare rules.
        </p>

        <h2>Purchases and subscriptions</h2>
        <p>
          Prices and included features are shown before checkout. One-time reports are charged once.
          Player Plus and Coach plans renew until canceled through the Stripe billing portal. Access
          continues through the paid billing period after cancellation. Taxes may be added where required.
        </p>

        <h2>Refunds</h2>
        <p>
          If a paid report cannot be delivered because of a MoveMirror failure, contact
          {" "}<a href="mailto:support@leglord.com">support@leglord.com</a> within seven days so we
          can repair the delivery or review a refund. Other completed digital purchases are generally
          non-refundable except where required by law. Canceling a subscription prevents future renewals.
        </p>

        <h2>Availability</h2>
        <p>
          Chess.com, Lichess and other providers can change their APIs, limits or licenses. MoveMirror
          may change, suspend or discontinue features when needed for security, compliance or reliability.
          We do not promise uninterrupted availability or permanent retention of saved reports.
        </p>

        <h2>Ownership and third-party services</h2>
        <p>
          MoveMirror&apos;s original interface and analysis code are protected by applicable law and any
          license published with its source. Chess data and platform marks belong to their respective
          owners. Stockfish is distributed under GPLv3. MoveMirror is not affiliated with or endorsed
          by Chess.com or Lichess.
        </p>

        <h2>Warranty and liability</h2>
        <p>
          The service is provided “as is” to the extent permitted by law. We are not liable for indirect,
          incidental or consequential losses arising from its use. Our total liability for a paid claim
          will not exceed the amount you paid MoveMirror during the twelve months before the claim.
          These limitations do not apply where prohibited by law.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms can be sent to
          {" "}<a href="mailto:support@leglord.com">support@leglord.com</a>.
        </p>
      </article>
    </main>
  )
}
