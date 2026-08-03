import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { appMenuOpenApiRef } from '../app/AppMenuOpenContext'

/** Signed-in identity + sign out + legal links at the bottom of the lobby. */
export function AppMenuAccountFooter() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function onSignOut() {
    if (busy) return
    setBusy(true)
    try {
      await signOut()
      appMenuOpenApiRef.current.setMenuOpen(false)
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-menu-modal__account-footer">
      {user ? (
        <div className="app-menu-modal__account">
          <p className="app-menu-modal__account-status">
            Signed in as{' '}
            <span className="app-menu-modal__account-email">{user.email ?? 'account'}</span>
          </p>
          <button
            type="button"
            className="app-menu-modal__sign-out"
            disabled={busy}
            onClick={() => void onSignOut()}
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
      <footer className="app-menu-modal__legal-footer">
        <a href="mailto:support@mahjlogic.com">support@mahjlogic.com</a>
        <span aria-hidden="true">·</span>
        <Link to="/privacy" onClick={() => appMenuOpenApiRef.current.setMenuOpen(false)}>
          Privacy
        </Link>
        <span aria-hidden="true">·</span>
        <Link to="/terms" onClick={() => appMenuOpenApiRef.current.setMenuOpen(false)}>
          Terms
        </Link>
      </footer>
    </div>
  )
}
