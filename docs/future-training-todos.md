# Future training / coach ideas (backlog)

Sourced from design discussion; not committed work. Revisit and break into tickets when ready.

## Charleston and hand choice

- [ ] Score the current concealed hand (or pass-relevant subset) against **multiple** card hands, not a single target.
- [ ] Derive pass hints: favor keeping tiles that appear in the **top N** scoring hands; deprioritize tiles that appear in **no** or **few** viable hands.

## Tile availability and “difficulty”

- [ ] Maintain a **visible universe**: own tiles, discards, exposures (and any other rules-relevant dead tiles).
- [ ] Given a hand’s **needed tiles** vs **dead / unavailable** tiles, compute a **difficulty or viability score** (e.g. impossible if all copies of a required tile are dead).
- [ ] Extend scoring to account for tiles **still unknown** (wall + opponents’ concealed), not only dead vs alive.

## Opponent modeling (defense / reads)

- [ ] Use opponents’ exposures to **narrow** plausible patterns on the card (e.g. repeated suit constraints suggesting 2468-like families).
- [ ] Optional: **discard risk** hints (“this discard may complete X for seat Y”) with clear uncertainty language, not over-precise percentages unless backed by a defined model.

## Jokers (offense)

- [ ] Model **path to completion** where jokers fill pung/kong/kong-like needs but **not** pairs (NMJL-specific).
- [x] Treat **joker swap** as a compound event: probability of drawing the swap tile × probability the swap target exposure still matters (game still in play, exposure still valid for swap).

## Jokers (defense)

- [ ] Pre-discard check: does this tile match an exposure that allows **joker reclaim**? Surface a “dangerous discard” style warning when appropriate.
- [ ] Track joker buckets for probability math: **exposed** (swap-eligible), **dead** (discards / dead hand), **unknown** (wall + concealed).

## Product / legal

- [ ] Decide how to present **card content** in the UI (official layout vs abstract names / patterns) with NMJL rights and app-store constraints in mind.

## Engineering hygiene

- [ ] Centralize NMJL rules about **where jokers may appear** (pairs vs combinations) so scoring, bots, and training hints stay consistent.
