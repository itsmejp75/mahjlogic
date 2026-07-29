import { Navigate, Route, Routes } from 'react-router-dom'
import App from '../App.tsx'
import { RequireAuth } from '../auth/RequireAuth'
import { AuthCallbackPage } from '../pages/AuthCallbackPage'
import { LandingPage } from '../pages/LandingPage'
import { PrivacyPage } from '../pages/PrivacyPage'
import { RackCheckerPage } from '../pages/RackCheckerPage'
import { TermsPage } from '../pages/TermsPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      {/* Lobby paused — send /home to the table until the hub returns. */}
      <Route path="/home" element={<Navigate to="/play" replace />} />
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
  )
}
