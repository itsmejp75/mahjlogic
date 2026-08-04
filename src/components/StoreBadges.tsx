/** Inactive App Store / Google Play badges — Coming soon until native apps ship. */
export function StoreBadges({ className }: { className?: string }) {
  return (
    <div
      className={['store-badges', className].filter(Boolean).join(' ')}
      aria-label="Mobile apps coming soon"
    >
      <button
        type="button"
        className="store-badges__badge store-badges__badge--apple"
        disabled
        aria-disabled="true"
        title="Coming soon"
      >
        <span className="store-badges__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M16.365 12.64c-.02-2.15 1.76-3.18 1.84-3.23-1.01-1.47-2.57-1.67-3.12-1.69-1.33-.13-2.6.78-3.27.78-.68 0-1.72-.76-2.83-.74-1.46.02-2.8.85-3.55 2.15-1.52 2.63-.39 6.52 1.09 8.65.72 1.04 1.58 2.2 2.71 2.16 1.09-.05 1.5-.7 2.81-.7 1.31 0 1.68.7 2.83.68 1.17-.02 1.91-1.05 2.62-2.1.83-1.2 1.17-2.36 1.19-2.42-.03-.01-2.28-.88-2.31-3.48zM14.7 5.98c.59-.72 1-1.72.89-2.72-.86.03-1.9.57-2.52 1.29-.55.63-1.04 1.65-.91 2.62.96.07 1.95-.49 2.54-1.19z" />
          </svg>
        </span>
        <span className="store-badges__text">
          <span className="store-badges__eyebrow">Download in the</span>
          <span className="store-badges__title">App Store</span>
          <span className="store-badges__soon">Coming soon</span>
        </span>
      </button>
      <button
        type="button"
        className="store-badges__badge store-badges__badge--google"
        disabled
        aria-disabled="true"
        title="Coming soon"
      >
        <span className="store-badges__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28">
            <path fill="#EA4335" d="M3.6 2.4 13.2 12 3.6 21.6A2.4 2.4 0 0 1 2 19.8V4.2A2.4 2.4 0 0 1 3.6 2.4z" />
            <path fill="#FBBC04" d="M17.3 9.1 14.4 12l2.9 2.9 3.7-2.1c1-.57 1-2.03 0-2.6l-3.7-2.1z" />
            <path fill="#4285F4" d="M3.6 21.6 13.2 12l4.1 4.1-9.5 5.4a2.4 2.4 0 0 1-4.2-.9z" />
            <path fill="#34A853" d="M3.6 2.4a2.4 2.4 0 0 1 4.2-.9l9.5 5.4-4.1 4.1L3.6 2.4z" />
          </svg>
        </span>
        <span className="store-badges__text">
          <span className="store-badges__eyebrow">Get it on</span>
          <span className="store-badges__title">Google Play</span>
          <span className="store-badges__soon">Coming soon</span>
        </span>
      </button>
    </div>
  )
}
