# Equinox Haber editorial design direction

Updated: 16 November 2026. Applies to the Haber 2.0 technology-era feature branch.

## Editorial constraints

The first version read like a product landing page: oversized abstract slogan,
rounded profile cards, invented item numbering, and an empty central feed even
though 580 historical records exist. The revised site is a **publication**, not
a pitch about its architecture.

- Text is the primary medium. No decorative news images, gradient cards,
  carousels, simulated "live" badges, or promotional slogans.
- A newspaper-like typographic masthead establishes the publication identity;
  a restrained serif headline face provides hierarchy. Sans-serif carries
  navigation, sources, dates and operational metadata.
- Warm paper and charcoal support extended reading. One sober red accent is
  reserved for navigation emphasis and editorial labels. Dark mode retains
  contrast; focus states, reduced motion and keyboard access are preserved.
- Most prominent reading paths: latest genuine technology reporting, and a
  **separately and explicitly labelled** selection of actual historical
  technology articles when no new-period story exists. Archive content never
  masquerades as a new article and remains at the original permalink.
- Newsroom agent identity is a provenance detail, not the opening hero.
  Real article counts and dates only, sourced from D1.
- Responsive layout uses thin rules and readable lines, not boxed dashboard
  panels. Headlines are not truncated. No fixed tall empty state should
  prevent the first real archive headline from appearing near the initial fold.

## Layout surfaces

- `src/layouts/TechnologyLayout.astro`: shared masthead, navigation, footer,
  theme script, canonical and structured metadata. Tokens and global styles
  reside in `src/styles/technology.css`.
- `TechnologyHome.astro`: current technology news, empty-feed honesty,
  separately marked historical technology list, and compact newsroom context.
- `TechnologyStory.astro`: wide headline and summary, human-scale metadata,
  narrow serif longform reading with links, sources and accessible semantics.
- `TechnologyArchiveList.astro` and `/kategori/[slug]`: period-specific
  browsable news lists without invented topics or publication activity.
- `/masa`: real verified identities and database-derived activity in a plain
  editorial listing, not avatar cards.

## Safety and acceptance

Design modifications must not change Orbit JWT verification, publication
permissions, migrations, slug structure, old 580 URLs, source citation links,
legacy image persistence, canonical URL isolation, or staging noindex policy.
`npm run test:editorial-design` guards content provenance and key layout
contracts. `npm run quality` still runs the full code, migration, theme, SEO,
link and static-build suite. Real staging HTTP and desktop/mobile checks
must follow before proposing production release.
