# Changelog

Releases of this repository. Each entry describes what changed in the code; [docs/ENGINEERING.md](docs/ENGINEERING.md#known-issues) has the details and the tests behind each change.

## 1.1 (September 24, 2026)

### Security

- The app's pages send a strict Content Security Policy. Scripts may come only from WikiScroll, cdnjs (Leaflet, for the map) and Cloudflare Web Analytics, and inline scripts and event handlers are blocked. The few inline handlers were replaced by listeners.
- The API no longer sends `Access-Control-Allow-Origin: *`. It serves only WikiScroll's own pages, so other sites can't spend its Wikimedia budget from their visitors' browsers.

### Reader

- Deleting a collection can be undone for 8 seconds, from a notice at the top of Saved Articles.
- Inside a collection, Remove takes an article out of that collection only. In "All", it still unsaves the article.
- Offline, opening a saved article from History shows its offline copy.

### Performance and languages

- Interface dictionaries are split into one file per language (about 10 KB each) instead of one 139 KB file, so each reader downloads only their own language. English readers download none.
- Non-English readers no longer see the English interface for a moment before their translation is applied.

### Maintenance

- The Worker's router and shared collections read one language list (`worker/languages.js`).
- The web app manifest declares its language, text direction and store categories.
- 184 tests (8 new, 7 updated).

## 1.0 (September 24, 2026)

First public release of the source code behind wikiscroll.com, including the fixes from a full audit of the reader: "On this day" recovery after an upstream failure, Popular and Known answering with their complete cards under a slow request, the Collect dialog, ambient mode on small screens, right-to-left article text, translations for every message, keyboard focus and landmarks, and more. See [Fixed in 1.0](docs/ENGINEERING.md#fixed-in-10).
