# Current branding

Run `node scripts/build-branding.mjs` from the repository root to rebuild app icons and the favicon, and render the social artwork to its public filename.

- `wordmark.svg`: canonical outlined logo used throughout the reader.
- `monogram.svg`: matching app-icon letter and blue diamond.
- `social-preview.svg`: editable 1200 × 630 social artwork. Solid dark background, canonical outlined wordmark and outlined “The discovery reader” subtitle. No photographs, external fonts or remote resources.
- `favicon.png`: generated favicon intermediate.

The homepage, About page, article fallback and shared collections use `public/images/og-discovery-v12.png`. Collection titles and descriptions remain specific to the shared list. The original globe generator, map geometry and country-highlight instructions have been removed. Rebuilding does not recreate the old artwork.

## Interface icons

`public/images/ui-icons.svg` is WikiScroll's custom two-tone SVG sheet for topics, maintenance labels and interface decorations. Astro renders it through `src/components/Icon.astro`; dynamic cards use `uiIcon()` in `public/app.js`. Colors, including darker light-theme equivalents, live in `src/styles/icons.css`. Keep icons decorative and retain adjacent text labels. The sheet is part of the service worker's offline shell. No external icon service or per-card icon request is used.
