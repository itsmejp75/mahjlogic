import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthProvider'

/** Sends signed-out users to the landing page. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()

  if (loading) {
    return (
      <main className="landing landing--callback" aria-busy="true">
        <p className="landing__status">Loading…</p>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/" replace />
  }

  return children
}
