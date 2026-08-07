import { Link } from 'react-router-dom'
import { TileGraphicsProvider } from '../../tiles/TileGraphicsContext'
import { usePageMeta } from '../../seo/usePageMeta'
import { LearnShell } from './LearnShell'
import { LEARN_TILE, LearnTileRow } from './LearnTileRow'

const T = LEARN_TILE

export function HowToPlayPage() {
  usePageMeta({
    title: 'How to Play American Mah Jongg | MahjLogic',
    description:
      'How to play American Mah Jongg (Mahjong): tiles, the NMJL-style card, Charleston, calling, jokers, Mah Jongg, and wall games — a beginner-friendly guide.',
    path: '/learn/how-to-play',
  })

  return (
    <LearnShell article>
      <TileGraphicsProvider tileGraphics="illustrative-classic">
        <article className="learn__doc">
          <h1>How to Play American Mah Jongg</h1>
          <p className="learn__lead">
            A clear walkthrough of American Mah Jongg — the NMJL-style game with racks, jokers, the
            annual card, and the Charleston. This is what Mahj Logic practices.
          </p>
          <p className="learn__note">
            Teaching summary only — not a substitute for the official National Mah Jongg League card
            or rulebook. Tile art varies by set; examples below use Mahj Logic Classic tiles. Clubs
            may add house rules (Mahj Logic can enable extra jokers or blanks).
          </p>

          <nav className="learn__toc" aria-label="On this page">
            <a href="#goal">Goal</a>
            <a href="#tiles">Tiles</a>
            <a href="#groups">Groups</a>
            <a href="#card">The card</a>
            <a href="#deal">Deal</a>
            <a href="#charleston">Charleston</a>
            <a href="#play">Gameplay</a>
            <a href="#calling">Calling</a>
            <a href="#jokers">Jokers</a>
            <a href="#winning">Winning</a>
          </nav>

          <h2 id="goal">The goal</h2>
          <p>
            Four players (East, South, West, North) each try to complete a <strong>14-tile hand</strong>{' '}
            that matches a line on the current year&apos;s card. You win by declaring{' '}
            <strong>Mah Jongg</strong> — either on a tile you draw from the wall, or by calling the
            live discard that finishes your hand.
          </p>
          <p>
            American Mah Jongg is not the same as Chinese or Japanese mahjong solitaire. The card,
            Charleston, and jokers are what make it unique.
          </p>

          <h2 id="tiles">The tiles (152)</h2>
          <p>
            A standard set has <strong>152</strong> tiles: numbered suits, winds, dragons, flowers,
            and jokers. There are four of each suit number, wind, and dragon.
          </p>

          <h3>Suits — Craks, Dots, Bams</h3>
          <p>Numbers 1–9 in three suits. The 1-bam is often drawn as a bird.</p>
          <LearnTileRow
            label="Craks (1–9)"
            defs={[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => T.crak(r))}
          />
          <LearnTileRow
            label="Dots (1–9)"
            defs={[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => T.dot(r))}
          />
          <LearnTileRow
            label="Bams (1–9)"
            defs={[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => T.bam(r))}
          />

          <h3>Winds</h3>
          <p>East, South, West, North — four of each.</p>
          <LearnTileRow
            label="Winds"
            defs={[T.wind('E'), T.wind('S'), T.wind('W'), T.wind('N')]}
          />

          <h3>Dragons</h3>
          <p>
            Red, Green, and White (Soap) — four of each. Matching dragons go with suits: Red with
            Craks, Green with Bams, White/Soap with Dots. Soap also stands for <strong>0</strong> in
            year hands.
          </p>
          <LearnTileRow
            label="Dragons"
            defs={[T.dragon('red'), T.dragon('green'), T.dragon('soap')]}
            caption="Red ↔ Craks · Green ↔ Bams · Soap ↔ Dots (and “0”)"
          />

          <h3>Flowers &amp; jokers</h3>
          <p>
            Eight flowers (all interchangeable) and eight jokers. Jokers are wild — with important
            limits described below.
          </p>
          <LearnTileRow
            label="Flower & joker"
            defs={[T.flower(1), T.flower(2), T.joker(), T.joker()]}
          />

          <h2 id="groups">Tile groups</h2>
          <p>Card hands are built from these groups of <em>identical</em> tiles:</p>
          <ul>
            <li>
              <strong>Single</strong> — one tile (e.g. one wind in NEWS, or one digit in a year)
            </li>
            <li>
              <strong>Pair</strong> — 2 alike
            </li>
            <li>
              <strong>Pung</strong> — 3 alike
            </li>
            <li>
              <strong>Kong</strong> — 4 alike
            </li>
            <li>
              <strong>Quint / Sextet</strong> — 5 or 6 alike (need jokers, since only four naturals
              exist)
            </li>
          </ul>
          <LearnTileRow
            label="Pair · Pung · Kong"
            defs={[
              T.dot(5),
              T.dot(5),
              T.crak(3),
              T.crak(3),
              T.crak(3),
              T.bam(8),
              T.bam(8),
              T.bam(8),
              T.bam(8),
            ]}
            caption="Two 5-dots (pair), three 3-craks (pung), four 8-bams (kong)"
          />
          <p>
            Watch out: patterns like <strong>NEWS</strong> or <strong>2026</strong> look bunched on
            the card, but they are <em>singles</em>, not a kong — so jokers cannot fill them.
          </p>
          <LearnTileRow
            label="NEWS = four singles"
            defs={[T.wind('N'), T.wind('E'), T.wind('W'), T.wind('S')]}
          />
          <LearnTileRow
            label="Year digits (example)"
            defs={[T.dot(2), T.dragon('soap'), T.dot(2), T.dot(6)]}
            caption="Soap stands in for 0 — still four singles"
          />

          <h2 id="card">Reading the card</h2>
          <p>
            Each line is a legal 14-tile hand. A new NMJL card is published most years; Mahj Logic
            also includes a Sample card for practice. You need your own official card for table play —
            we can&apos;t reproduce the league card here.
          </p>
          <h3>Abbreviations</h3>
          <ul>
            <li>
              <strong>1–9</strong> — numbered tiles · <strong>F</strong> flower · <strong>D</strong>{' '}
              dragon
            </li>
            <li>
              <strong>N E W S</strong> — winds · <strong>0</strong> — soap (white dragon)
            </li>
            <li>
              <strong>X</strong> — exposed hand (you may call discards for pungs/kongs/etc.)
            </li>
            <li>
              <strong>C</strong> — concealed hand (no calling for exposures; only call the final tile
              for Mah Jongg)
            </li>
          </ul>
          <h3>Colors on the card</h3>
          <p>
            Blue, red, and green on the card do <em>not</em> mean fixed suits. Within one hand, tiles
            printed the same color must be the same suit; different colors mean different suits. When
            dragons share a color with numbers, use matching dragons; a different color often means
            opposite dragons.
          </p>
          <h3>Sections &amp; notes</h3>
          <p>
            Hands are grouped (Year, 2468, consecutive runs, odds, winds &amp; dragons, Singles and
            Pairs, and more). Always read the parenthetical note on the line — it settles suit rules
            and exceptions. Points on the line are the hand&apos;s base value for scoring.
          </p>

          <h2 id="deal">Deal &amp; seats</h2>
          <p>
            In person, players build walls and deal from dice. In Mahj Logic, dealing is automatic:{' '}
            <strong>East gets 14 tiles</strong>; the others get <strong>13</strong>; the rest stay in
            the wall. East discards first to start play after the Charleston.
          </p>

          <h2 id="charleston">The Charleston</h2>
          <p>
            Before picking from the wall, everyone passes tiles to reshape their opening rack. You
            may <strong>not</strong> pass jokers (or blanks, if your table uses them).
          </p>
          <ul>
            <li>
              <strong>1st Charleston</strong> (required): pass 3 <em>right</em>, then <em>across</em>,
              then <em>left</em>. On the first left you may <strong>blind pass</strong> 0–3 (top up
              with tiles you just received, without looking at those).
            </li>
            <li>
              After that left, the table may stop the second Charleston — but a Courtesy pass still
              happens.
            </li>
            <li>
              <strong>2nd Charleston</strong> (optional, if all agree): left, across, right (blind
              pass allowed on the last right).
            </li>
            <li>
              <strong>Courtesy</strong>: exchange 0–3 across (usually the smaller number both want).
            </li>
          </ul>

          <h2 id="play">Gameplay</h2>
          <ol>
            <li>East discards one tile (down to 13).</li>
            <li>
              Play continues to the right: draw from the wall, then discard — unless someone calls
              the discard.
            </li>
            <li>
              Once the next player has picked and racked (or discarded), the previous discard can no
              longer be called.
            </li>
            <li>Continue until someone declares Mah Jongg or the wall is empty (wall game).</li>
          </ol>

          <h2 id="calling">Calling a discard</h2>
          <p>You may call the most recent discard only to:</p>
          <ul>
            <li>
              Complete a <strong>pung, kong, quint, or sextet</strong> for an <strong>exposed</strong>{' '}
              hand, or
            </li>
            <li>
              Declare <strong>Mah Jongg</strong> (even for a single or pair, or on a concealed hand).
            </li>
          </ul>
          <p>You cannot call for ordinary singles or pairs, and you can never call a discarded joker.</p>
          <LearnTileRow
            label="Exposure example (kong with joker)"
            defs={[T.crak(6), T.crak(6), T.joker(), T.crak(6)]}
            caption="Called/exposed set — face-up for everyone to see"
          />
          <p>
            Expose the set on your rack, then discard to end your turn. You may adjust an exposure
            until you discard; after that it stays. If two players call, Mah Jongg wins; otherwise the
            player nearer in turn order takes the tile.
          </p>

          <h2 id="jokers">Jokers &amp; swapping</h2>
          <ul>
            <li>
              Jokers fill <strong>pungs, kongs, quints, and sextets</strong> only — never singles or
              pairs, and never in Singles and Pairs hands.
            </li>
            <li>A discarded joker is dead — nobody can call it.</li>
            <li>
              On your turn (after you draw or call), you may <strong>swap</strong>: give a matching
              natural for a joker sitting in any exposure (yours or an opponent&apos;s), then discard
              as usual.
            </li>
          </ul>
          <LearnTileRow
            label="Natural ready to redeem a joker"
            defs={[T.crak(5), T.crak(5), T.joker(), T.joker()]}
            caption="If you hold a 5-crak, you can take a joker from this exposed pung/kong"
          />

          <h2 id="winning">Winning, wall games &amp; dead hands</h2>
          <ul>
            <li>
              Declare <strong>Mah Jongg</strong> when your 14 tiles match a legal card line.
            </li>
            <li>
              <strong>Jokerless</strong> Mah Jongg doubles the card value (except Singles and Pairs).
              Self-pick vs discard also changes how much each seat pays.
            </li>
            <li>
              A false Mah Jongg claim makes the declarer&apos;s hand <strong>dead</strong>.
            </li>
            <li>
              If the wall runs out with no winner, it&apos;s a <strong>wall game</strong> (no win
              payout).
            </li>
            <li>
              A <strong>dead hand</strong> (wrong tile count, illegal exposure, or other league
              faults) stops that player from picking and discarding under table rules. Mahj Logic can
              warn you before some dead-hand mistakes when Helpers are on.
            </li>
          </ul>

          <p>
            Next: how to use these rules in the app — see the{' '}
            <Link to="/learn/app-guide">App Guide</Link> — then <Link to="/home">Play</Link>.
          </p>
        </article>
      </TileGraphicsProvider>
    </LearnShell>
  )
}
