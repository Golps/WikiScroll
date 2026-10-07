# Current branding

Run `node scripts/build-branding.mjs` from site to rebuild the live share image, app icons and favicon.

- wordmark.svg: canonical outlined About-card logo used across the site and previews.
- monogram.svg: matching app-icon letter and blue diamond punctuation.
- land-detailed.geojson and easteregg.geojson: Natural Earth 1:50m geometry (public domain), used for the globe and its subtle visual easter egg.
- share-card.svg and favicon.png: current generated artwork (the app icons are drawn from monogram.svg).

The headline font is bundled under worker/fonts with its license. Public outputs live in public/images. Natural Earth terms: https://www.naturalearthdata.com/about/terms-of-use/
