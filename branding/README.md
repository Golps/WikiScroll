# Current branding

Run `node scripts/build-branding.mjs` from the repository root to rebuild app icons and the favicon, and copy the approved social artwork to its public filename.

- `wordmark.svg`: canonical outlined logo used throughout the reader.
- `monogram.svg`: matching app-icon letter and blue diamond.
- `discovery-preview.png`: approved 1731 x 909 social artwork showing three article cards based on Wikimedia photographs, with an AI-edited presentation and the headline "Turn doomscrolling into discovery.". The card subjects are Blue dragon, STEVE and Socotra. Photo credits are centered beneath the middle card on a dark charcoal background. See ../THIRD_PARTY_NOTICES.md for source links and licenses. This composition is not a screenshot of the reader.
- `favicon.png`: generated favicon intermediate.

The homepage, About page, article fallback and shared collections use `public/images/og-discovery-v11.png`. Collection titles and descriptions remain specific to the shared list. The original globe generator, map geometry and country-highlight instructions have been removed. Rebuilding does not recreate the old artwork.
