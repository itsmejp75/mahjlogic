import { Navigate, Route, Routes } from 'react-router-dom'
import App from '../App.tsx'
import { GaPageViews } from './GaPageViews'
import { PlayEnterLoaderHost } from '../auth/PlayEnterLoaderHost'
import { RequireAuth } from '../auth/RequireAuth'
import { AuthCallbackPage } from '../pages/AuthCallbackPage'
import { HomePage } from '../pages/HomePage'
import { LandingPage } from '../pages/LandingPage'
import { LoginPage } from '../pages/LoginPage'
import { AppGuidePage } from '../pages/learn/AppGuidePage'
import { HowToPlayPage } from '../pages/learn/HowToPlayPage'
import { LearnHubPage } from '../pages/learn/LearnHubPage'
import { StrategiesPage } from '../pages/learn/StrategiesPage'
import { PrivacyPage } from '../pages/PrivacyPage'
import { RackCheckerPage } from '../pages/RackCheckerPage'
import { SeoTopicPage } from '../pages/SeoTopicPage'
import { TermsPage } from '../pages/TermsPage'

export function AppRoutes() {
  return (
    <>
    <GaPageViews />
    <PlayEnterLoaderHost />
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/learn" element={<LearnHubPage />} />
      <Route path="/learn/how-to-play" element={<HowToPlayPage />} />
      <Route path="/learn/app-guide" element={<AppGuidePage />} />
      <Route path="/learn/strategies" element={<StrategiesPage />} />
      {/* Public SEO pillars — production synonyms also 301 via vercel.json */}
      <Route
        path="/american-mah-jongg-practice"
        element={<SeoTopicPage topicId="practice" />}
      />
      <Route path="/mah-jongg-tile-checker" element={<SeoTopicPage topicId="tile-checker" />} />
      <Route path="/american-mah-jongg-app" element={<SeoTopicPage topicId="app" />} />
      {/* Dev / non-Vercel synonym fallbacks (production prefers HTTP 301s) */}
      <Route path="/mahjong-practice" element={<Navigate to="/american-mah-jongg-practice" replace />} />
      <Route path="/mah-jongg-practice" element={<Navigate to="/american-mah-jongg-practice" replace />} />
      <Route
        path="/american-mahjong-practice"
        element={<Navigate to="/american-mah-jongg-practice" replace />}
      />
      <Route
        path="/american-mah-jongg-training"
        element={<Navigate to="/american-mah-jongg-practice" replace />}
      />
      <Route
        path="/american-mahjong-training"
        element={<Navigate to="/american-mah-jongg-practice" replace />}
      />
      <Route path="/mahjong-training" element={<Navigate to="/american-mah-jongg-practice" replace />} />
      <Route path="/mah-jongg-training" element={<Navigate to="/american-mah-jongg-practice" replace />} />
      <Route path="/mahjong-drill" element={<Navigate to="/american-mah-jongg-practice" replace />} />
      <Route path="/mah-jongg-drill" element={<Navigate to="/american-mah-jongg-practice" replace />} />
      <Route path="/mahjong-coach" element={<Navigate to="/american-mah-jongg-practice" replace />} />
      <Route path="/mah-jongg-coach" element={<Navigate to="/american-mah-jongg-practice" replace />} />
      <Route
        path="/practice-american-mah-jongg"
        element={<Navigate to="/american-mah-jongg-practice" replace />}
      />
      <Route
        path="/practice-american-mahjong"
        element={<Navigate to="/american-mah-jongg-practice" replace />}
      />
      <Route path="/tile-checker" element={<Navigate to="/mah-jongg-tile-checker" replace />} />
      <Route path="/tiles-checker" element={<Navigate to="/mah-jongg-tile-checker" replace />} />
      <Route path="/tile-scanner" element={<Navigate to="/mah-jongg-tile-checker" replace />} />
      <Route path="/mahjong-tile-checker" element={<Navigate to="/mah-jongg-tile-checker" replace />} />
      <Route path="/mahjong-tile-scanner" element={<Navigate to="/mah-jongg-tile-checker" replace />} />
      <Route path="/mah-jongg-tile-scanner" element={<Navigate to="/mah-jongg-tile-checker" replace />} />
      <Route path="/mah-jongg-rack-checker" element={<Navigate to="/mah-jongg-tile-checker" replace />} />
      <Route path="/mahjong-rack-checker" element={<Navigate to="/mah-jongg-tile-checker" replace />} />
      <Route path="/rack-checker-tool" element={<Navigate to="/mah-jongg-tile-checker" replace />} />
      <Route path="/hand-checker" element={<Navigate to="/mah-jongg-tile-checker" replace />} />
      <Route path="/check-mahjong-tiles" element={<Navigate to="/mah-jongg-tile-checker" replace />} />
      <Route path="/check-mah-jongg-tiles" element={<Navigate to="/mah-jongg-tile-checker" replace />} />
      <Route
        path="/american-mahjong-tile-checker"
        element={<Navigate to="/mah-jongg-tile-checker" replace />}
      />
      <Route
        path="/american-mah-jongg-tile-checker"
        element={<Navigate to="/mah-jongg-tile-checker" replace />}
      />
      <Route path="/american-mahjong-app" element={<Navigate to="/american-mah-jongg-app" replace />} />
      <Route path="/mahjong-app" element={<Navigate to="/american-mah-jongg-app" replace />} />
      <Route path="/mah-jongg-app" element={<Navigate to="/american-mah-jongg-app" replace />} />
      <Route
        path="/american-mahjong-practice-app"
        element={<Navigate to="/american-mah-jongg-app" replace />}
      />
      <Route
        path="/american-mah-jongg-practice-app"
        element={<Navigate to="/american-mah-jongg-app" replace />}
      />
      <Route path="/amercian-mah-jongg-app" element={<Navigate to="/american-mah-jongg-app" replace />} />
      <Route path="/amercian-mahjong-app" element={<Navigate to="/american-mah-jongg-app" replace />} />
      <Route
        path="/amercian-mah-jongg-practice-app"
        element={<Navigate to="/american-mah-jongg-app" replace />}
      />
      <Route
        path="/amercian-mahjong-practice-app"
        element={<Navigate to="/american-mah-jongg-app" replace />}
      />
      <Route
        path="/home"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/play"
        element={
          <RequireAuth>
            <App />
          </RequireAuth>
        }
      />
      <Route
        path="/rack-checker"
        element={
          <RequireAuth>
            <RackCheckerPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
