# Current branding

Run `node scripts/build-branding.mjs` from the repository root to rebuild app icons and the favicon, and copy the approved social artwork to its public filename.

- `wordmark.svg`: canonical outlined logo used throughout the reader.
- `monogram.svg`: matching app-icon letter and blue diamond.
- `discovery-preview.png`: approved 1200 x 630 social artwork showing three illustrative article cards and the headline "Replace doomscrolling with discovery". The artwork is an AI-generated illustration, not a screenshot or sourced article photograph.
- `favicon.png`: generated favicon intermediate.

The homepage, About page, article fallback and shared collections use `public/images/og-discovery-v9.png`. Collection titles and descriptions remain specific to the shared list. The original globe generator, map geometry and country-highlight instructions have been removed. Rebuilding does not recreate the old artwork.
