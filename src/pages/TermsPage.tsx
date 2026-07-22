import { LegalDocPage } from './LegalDocPage'

export function TermsPage() {
  return (
    <LegalDocPage title="Terms of Service">
      <p>
        These Terms of Service (“Terms”) govern your use of Mahj Logic, including the website at{' '}
        <a href="https://mahjlogic.com/">mahjlogic.com</a>, related progressive web apps, and mobile
        apps. By creating an account or using the service, you agree to these Terms.
      </p>

      <h2>The service</h2>
      <p>
        Mahj Logic is a practice and learning console for American Mah Jongg. Features may include
        practice play, discard tracking, and hand guidance. We may add, change, or remove features
        over time.
      </p>

      <h2>Accounts</h2>
      <ul>
        <li>You must provide accurate account information and keep it secure.</li>
        <li>You are responsible for activity under your account.</li>
        <li>We may suspend or end accounts that abuse the service or violate these Terms.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Attempt to break, scrape, or overload the service</li>
        <li>Misuse authentication or access another user’s account</li>
        <li>Use Mahj Logic for unlawful purposes</li>
        <li>Reverse engineer the app except where allowed by law</li>
      </ul>

      <h2>Intellectual property</h2>
      <p>
        Mahj Logic branding, software, and original content are owned by us or our licensors. Official
        Mah Jongg card content and trademarks belonging to third parties remain their property. You
        may not copy or redistribute the app or its materials except as we expressly allow.
      </p>

      <h2>Disclaimer</h2>
      <p>
        The service is provided “as is” for practice and entertainment. We do not guarantee
        uninterrupted availability, error-free operation, or that hand suggestions will match any
        particular club, tournament, or house rules.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, Mahj Logic and its operators are not liable for
        indirect, incidental, or consequential damages arising from your use of the service.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these Terms. Continued use after changes means you accept the updated Terms.
        The “Last updated” date at the top of this page will change when we revise them.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms: <a href="mailto:jpmessina75@gmail.com">jpmessina75@gmail.com</a>
      </p>
      <p>These Terms are a plain-language starting point and are not a substitute for legal advice.</p>
    </LegalDocPage>
  )
}
