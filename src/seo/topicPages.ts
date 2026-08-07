import type { PageMeta } from './usePageMeta'

export type SeoTopicId = 'practice' | 'tile-checker' | 'app'

export type SeoTopic = PageMeta & {
  id: SeoTopicId
  /** Route path for this pillar (also used as canonical). */
  path: string
  h1: string
  lead: string
  heroImage: string
  heroAlt: string
  sections: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }>
  ctaLabel: string
  related: Array<{ to: string; label: string }>
}

/**
 * Indexable pillar pages. Synonym URLs 301 → these paths in `vercel.json`
 * so authority consolidates instead of spreading across thin duplicates.
 */
export const SEO_TOPICS: Record<SeoTopicId, SeoTopic> = {
  practice: {
    id: 'practice',
    path: '/american-mah-jongg-practice',
    title: 'American Mah Jongg Practice & Training | MahjLogic',
    description:
      'Practice and train American Mah Jongg (Mahjong) with suggested hands, tile highlights, discard tracking, and smart coaching — a home drill console for NMJL-style play.',
    h1: 'American Mah Jongg practice & training',
    lead: 'MahjLogic is a practice console for American Mah Jongg — also searched as American Mahjong — built for drills, training sessions, and getting sharper between table games.',
    heroImage: '/marketing/practice.jpg',
    heroAlt: 'MahjLogic American Mah Jongg practice table',
    image: '/marketing/practice.jpg',
    ctaLabel: 'Start practicing free',
    sections: [
      {
        heading: 'Practice, train, and drill at home',
        paragraphs: [
          'Whether you call it practice, training, or drilling hands, the goal is the same: recognize patterns faster and make better discards. MahjLogic gives you a full American Mah Jongg training table with guidance built in — suggested hands, highlighted tiles, opponent-hand cues, and other coaching hints so every session teaches something.',
          'Use it as a Mah Jongg coach between club nights, or as a quiet Mahjong workout when you want reps without waiting for three other players.',
        ],
      },
      {
        heading: 'What you can work on',
        paragraphs: [
          'Sessions are built around real NMJL-style card thinking — not solitaire puzzles that ignore how American Mah Jongg is actually played.',
        ],
        bullets: [
          'Suggested hands so you see which card lines fit your rack',
          'Highlighted tiles and discard tracking while you practice',
          'Hints for Mah Jongg calls, joker swaps, and dead-hand risk',
          'A console that doubles as American Mahjong training between games',
        ],
      },
      {
        heading: 'Who this is for',
        paragraphs: [
          'Newer players who want American Mah Jongg practice without pressure, returning players brushing up before a tournament, and regulars who treat training like part of the game — not just something that happens at the table.',
        ],
      },
    ],
    related: [
      { to: '/mah-jongg-tile-checker', label: 'Tile / rack checker' },
      { to: '/american-mahjong-app', label: 'American Mahjong app' },
    ],
  },

  'tile-checker': {
    id: 'tile-checker',
    path: '/mah-jongg-tile-checker',
    title: 'Mah Jongg Tile Checker & Rack Checker | MahjLogic',
    description:
      'Check American Mah Jongg tiles against the card: rack checker, tile checker, and tile scanner-style analysis with closest hands and finish probabilities.',
    h1: 'Mah Jongg tile checker & rack checker',
    lead: 'Enter your tiles to check what your rack can become — a Mah Jongg tile checker, tiles checker, rack checker, and hand checker in one place, with finish odds before the wall runs out.',
    heroImage: '/marketing/rack-checker.jpg',
    heroAlt: 'MahjLogic Rack Checker checking Mah Jongg tiles',
    image: '/marketing/rack-checker.jpg',
    ctaLabel: 'Check your tiles',
    sections: [
      {
        heading: 'Check tiles against the card',
        paragraphs: [
          'Paste or build your rack and MahjLogic scans it the way a careful player would: closest matching hands, overlooked sections, and overlaps you might miss when staring at the card. Think of it as a tile scanner for American Mah Jongg — without photographing the table.',
          'People search for rack checker, tile checker, tiles checker, hand checker, or “check my Mahjong tiles.” Same job: make sense of the tiles in front of you.',
        ],
      },
      {
        heading: 'Probabilities, not guesswork',
        paragraphs: [
          'Beyond “what hands am I close to,” see the probability of finishing before the wall is gone. That turns a quick tile check into a real planning tool for Charleston and mid-game pivots.',
        ],
        bullets: [
          'Closest card hands for your current tiles',
          'Spot sections you may have overlooked',
          'Finish odds while tiles remain in the wall',
          'Works for American Mah Jongg and American Mahjong spelling searches',
        ],
      },
      {
        heading: 'Practice table + checker together',
        paragraphs: [
          'Use the checker when you want a focused read on a rack, then jump into full practice / training play when you want the whole table experience with coaching hints.',
        ],
      },
    ],
    related: [
      { to: '/american-mah-jongg-practice', label: 'Practice & training' },
      { to: '/american-mahjong-app', label: 'American Mahjong app' },
    ],
  },

  app: {
    id: 'app',
    path: '/american-mahjong-app',
    title: 'American Mahjong App for Practice | MahjLogic',
    description:
      'MahjLogic is an American Mahjong / American Mah Jongg app for practice, training, and checking tiles — suggested hands, probabilities, and coaching in one console.',
    h1: 'American Mahjong & Mah Jongg app',
    lead: 'Looking for an American Mahjong app — or American Mah Jongg app — built for practice, training, and checking tiles? MahjLogic is a smart console for NMJL-style play.',
    heroImage: '/marketing/practice.jpg',
    heroAlt: 'MahjLogic American Mahjong practice app',
    image: '/marketing/practice.jpg',
    ctaLabel: 'Open MahjLogic',
    sections: [
      {
        heading: 'One app for practice and tile checks',
        paragraphs: [
          'MahjLogic combines an American Mah Jongg practice table with a rack / tile checker. Train with suggested hands and coaching, or check Mahjong tiles when you want a fast read on the card — without juggling separate tools.',
        ],
      },
      {
        heading: 'Built for American-style play',
        paragraphs: [
          'This is not Chinese or Japanese mahjong solitaire. The product language matches how American players search and speak: Mah Jongg and Mahjong, practice and training, rack checker and tile scanner.',
        ],
        bullets: [
          'Practice / training console with intelligent hints',
          'Rack checker to check tiles and closest hands',
          'Tile probabilities and discard awareness',
          'Stats and game history as you improve',
        ],
      },
      {
        heading: 'Start free in the browser',
        paragraphs: [
          'Sign in on the web to practice American Mah Jongg, run tile checks, and build the habits that show up at your next real table. Mobile app store listings are on the way; the web console is ready now.',
        ],
      },
    ],
    related: [
      { to: '/american-mah-jongg-practice', label: 'Practice & training' },
      { to: '/mah-jongg-tile-checker', label: 'Tile / rack checker' },
    ],
  },
}

export const SEO_TOPIC_LIST = Object.values(SEO_TOPICS)
