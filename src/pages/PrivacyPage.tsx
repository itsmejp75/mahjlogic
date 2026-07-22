import { LegalDocPage } from './LegalDocPage'

export function PrivacyPage() {
  return (
    <LegalDocPage title="Privacy Policy">
      <p>
        Mahj Logic (“we”, “us”) provides a smart American Mah Jongg practice console. This policy
        explains what information we collect and how we use it when you use the Mahj Logic website,
        progressive web app, or mobile apps.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information</strong> — email address and authentication details when you
          sign up with email/password or a social provider such as Google (processed by our auth
          provider, Supabase).
        </li>
        <li>
          <strong>Usage data</strong> — basic analytics such as page views or app opens (for example
          via Google Analytics if enabled) to understand how the product is used.
        </li>
        <li>
          <strong>Local preferences</strong> — settings stored on your device (theme, filters, and
          similar) so the app remembers how you like to play.
        </li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>To create and secure your account and keep you signed in</li>
        <li>To operate, maintain, and improve Mahj Logic</li>
        <li>To communicate about your account or important service updates</li>
        <li>To protect against abuse and troubleshoot problems</li>
      </ul>

      <h2>Sharing</h2>
      <p>
        We do not sell your personal information. We use service providers that process data on our
        behalf, including:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — authentication and related backend services
        </li>
        <li>
          <strong>Google</strong> — if you choose Sign in with Google, and for optional analytics
        </li>
        <li>Hosting providers that serve the app (for example Vercel)</li>
      </ul>

      <h2>Data retention</h2>
      <p>
        We keep account information while your account is active. You may request account deletion by
        contacting us at the email below. Local preferences remain on your device until you clear
        site/app data.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Sign out or close your account</li>
        <li>Use device/browser controls to clear local storage and cookies</li>
        <li>Revoke Google access from your Google Account permissions if you used Google sign-in</li>
      </ul>

      <h2>Children</h2>
      <p>
        Mahj Logic is not directed to children under 13. We do not knowingly collect personal
        information from children under 13.
      </p>

      <h2>Cookies and similar technologies</h2>
      <p>
        We use cookies and similar technologies (such as local storage) to run Mahj Logic and
        understand how it is used. These may include:
      </p>
      <ul>
        <li>
          <strong>Essential / account</strong> — to keep you signed in and secure your session
          (including through our auth provider, Supabase).
        </li>
        <li>
          <strong>Preferences</strong> — to remember settings on your device (for example theme and
          game options) via local storage.
        </li>
        <li>
          <strong>Analytics</strong> — Google Analytics may set cookies or use similar tech to
          collect aggregated usage information (such as pages visited and approximate location
          derived from IP) so we can improve the product.
        </li>
      </ul>
      <p>
        You can control cookies through your browser settings and clear site data / local storage at
        any time. Blocking essential cookies may prevent sign-in or other core features from working.
        Analytics may also be limited by browser controls or extensions that block tracking.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href="mailto:support@mahjlogic.com">support@mahjlogic.com</a>
      </p>
      <p>
        This summary is provided for transparency and is not legal advice. We may update this page as
        the product evolves; the “Last updated” date will change when we do.
      </p>
    </LegalDocPage>
  )
}
