import { Link } from 'react-router-dom'
import { usePageMeta } from '../../seo/usePageMeta'
import { LearnShell } from './LearnShell'

export function AppGuidePage() {
  usePageMeta({
    title: 'Mahj Logic App Guide | Learn',
    description:
      'Mahj Logic app guide: Practice table, Rack Checker, suggested hands, Charleston, Call, Swap, Settings helpers, and Stats.',
    path: '/learn/app-guide',
  })

  return (
    <LearnShell article>
      <article className="learn__doc">
        <h1>App Guide</h1>
        <p className="learn__lead">
          How to use Mahj Logic — Practice, Rack Checker, and the helpers that coach you while you
          play.
        </p>

        <h2>Home</h2>
        <p>After you sign in, Home is your hub:</p>
        <ul>
          <li>
            <strong>Practice → Play</strong> opens a full American Mah Jongg table against bots,
            with Charleston, calls, and coaching tools.
          </li>
          <li>
            <strong>Rack Checker</strong> lets you build a rack and see closest card hands, plus the
            probability of completing your hand before the wall runs out — not odds of beating an
            opponent.
          </li>
          <li>
            <strong>Stats</strong> shows your recent results and wall games.
          </li>
        </ul>

        <h2>Practice table — action row</h2>
        <p>Along the bottom of your rack you&apos;ll see the main controls:</p>
        <ul>
          <li>
            <strong>Sort</strong> — tidy your tiles.
          </li>
          <li>
            <strong>Settings</strong> — card year, bots, house rules, theme, and Helpers.
          </li>
          <li>
            <strong>New</strong> — start a new game.
          </li>
          <li>
            <strong>Hands</strong> — open Suggested Hands (card lines that fit your rack).
          </li>
          <li>
            <strong>Tiles</strong> — highlight tiles that still matter for the focused hand.
          </li>
          <li>
            <strong>Mah Jongg</strong> — declare when you have a legal win.
          </li>
          <li>
            <strong>Call</strong> — claim the live discard for an exposure (or Mah Jongg).
          </li>
          <li>
            <strong>Swap</strong> — redeem a natural tile for a joker in an exposure.
          </li>
          <li>
            <strong>Discard</strong> / <strong>Ignore</strong> / <strong>Done</strong> — discard on
            your turn, skip calling a bot discard, or finish staging a call.
          </li>
        </ul>
        <p>The wall count shows how many tiles remain.</p>

        <h2>Charleston in the app</h2>
        <ul>
          <li>
            Follow the pass-strip title and instruction (Right / Across / Left, then optional second
            Charleston and Courtesy).
          </li>
          <li>
            Click or drag three tiles into the pass strip, then tap <strong>Pass</strong>.
          </li>
          <li>Jokers and blanks cannot be passed.</li>
          <li>
            On blind steps, you may pass fewer than three. On the second Charleston, an empty strip +
            Pass can skip ahead to Courtesy when the UI allows.
          </li>
        </ul>

        <h2>Suggested Hands and Tiles</h2>
        <ul>
          <li>
            <strong>Hands</strong> lists card lines ranked for your rack — how many tiles away, and
            (if enabled) the chance of completing that hand before the wall runs out.
          </li>
          <li>Tap a line to focus it; that drives highlights and some reminders.</li>
          <li>
            <strong>Tiles</strong> paints which tiles still help the focused line on your rack and
            in the discard tracker.
          </li>
        </ul>

        <h2>Discard tracker</h2>
        <p>
          The top band shows discarded tiles sorted by suit. Use it to see what is gone. When{' '}
          <strong>Tiles</strong> is on and a suggested hand is selected, it also highlights tiles you
          still need for that hand. If blanks are enabled, on your turn you can click or drag a blank
          onto the tracker to exchange it for a discarded natural.
        </p>

        <h2>Calling and swapping</h2>
        <ul>
          <li>
            When a bot discards something you can use, tap <strong>Call</strong> (or click or drag the
            discard into the call target), stage the meld on the exposure rack, then{' '}
            <strong>Done</strong>, then discard.
          </li>
          <li>
            On your turn, redeem a natural for a joker in any exposure (yours or a bot&apos;s):{' '}
            <strong>drag and drop</strong> the natural onto that meld, or <strong>click</strong> the
            natural into your discard slot and then tap <strong>Swap</strong>.
          </li>
        </ul>

        <h2>Settings → Helpers</h2>
        <p>Turn coaching on or off to match how much help you want:</p>
        <ul>
          <li>
            <strong>Mah Jongg hint</strong> — lights the Mah Jongg control when a win is legal.
          </li>
          <li>
            <strong>Joker swap hint</strong> — bounces the tiles you can swap and highlights the{' '}
            <strong>Swap</strong> button.
          </li>
          <li>
            <strong>Dead tile / dead hand warnings</strong> — caution before a discard or call that
            ruins a line or kills the hand.
          </li>
          <li>
            <strong>Hand Probability %</strong> — chance of completing a suggested hand before the
            wall runs out (not odds vs an opponent).
          </li>
          <li>
            <strong>Bot hands identifier</strong> — see which card lines fit a bot&apos;s exposures.
          </li>
          <li>
            <strong>Concealed Reminder</strong> — warn when calling while focused on a concealed
            line.
          </li>
          <li>
            <strong>Undo</strong> — step back from some mistakes when enabled.
          </li>
        </ul>
        <p>
          Also under Settings: choose the <strong>card</strong> (Sample / 2025 / 2026), bot
          difficulty, East vs random seat, theme, tile art, and house rules (10 jokers, blanks).
        </p>

        <h2>Rack Checker</h2>
        <p>
          From Home, open <strong>Rack Checker</strong> to assemble up to a full rack from the tile
          picker. The same suggested-hands engine shows closest card matches and the probability of
          completing your hand before the wall runs out — not the chance of finishing ahead of an
          opponent. Use it to study a real-table rack or explore what a deal can become.
        </p>

        <p>
          New to the rules? Read{' '}
          <Link to="/learn/how-to-play">How to Play American Mah Jongg</Link>, then{' '}
          <Link to="/home">Play</Link>.
        </p>
      </article>
    </LearnShell>
  )
}
