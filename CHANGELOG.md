# Changelog

Releases of this repository. Each entry describes what changed in the code; [docs/ENGINEERING.md](docs/ENGINEERING.md#known-issues) has the details and the tests behind each change.

## 1.4 (September 24, 2026)

### Saved articles

- Saved articles no longer collide across languages. Their identifiers had the page number but not the language, so saving a Spanish article could replace an English save with the same number. English saves keep their current identifiers; other languages are stored as `es:w123`, with the language taken from the article's address.
- The first time 1.4 loads, existing saves in other languages move to the new identifiers, with their collections and offline copies.
- History keeps the same page in two languages as two entries. Shared links, shared collections and the map still use the plain page number.

### On this day

- Photos from `thumb.wikimedia.org` are accepted, like those from `upload.wikimedia.org`. Before, the same anniversary article qualified on one host and was dropped on the other.
- Card photos are requested 960 pixels wide instead of 800. Wikimedia serves thumbnails in standard widths, and 800-pixel requests failed.

### Travel search on Cloudflare's Free plan

- A travel search stays well under the Free plan's 50 subrequests per request. In the worst case (three places, no guide with an introduction), 1.3 made 53 per answer; 1.4 makes 20.
- The first paragraphs read for a results page are kept at the edge for a day in one entry, so a repeated request continues with the next 8 guides instead of reading the first ones again.
- Searches for several places ask for 30 results in total, split between them (15 each for two places, 10 each for three).
- The browser asks for an unfinished page up to 3 times instead of 2. At 8 guides per answer, 4 answers cover a full page of 30.

### Interface

- Browser tabs show "WikiScroll" and "About WikiScroll". Link previews and the search description keep the full line.

207 tests (7 new). The new tests fail on the 1.3 code.

## 1.3 (September 24, 2026)

### Travel search

- Guides that were still loading when the server answered are no longer skipped. The server says where to resume (`resume`), and the browser asks for the same results again (twice at most) before moving on. Before, it moved past them, so a slow answer could hide guides for the rest of the session and end the feed on "every matching guide" too early.
- Guides with no introduction, common on the Spanish and Japanese Wikivoyage, now show their first paragraphs instead of being left out. Headings, lists and unfinished sentences are skipped. The text is kept at the edge for a week.
- Phrasebooks are left out in every Wikivoyage edition, by the edition's phrasebook category or by how its phrasebooks are really titled ("Sprachführer Englisch", "Guía de húngaro", "英語会話集"). Before, only English titles were recognized. Guides that only look similar, such as "Guía de Madrid", are kept. The random Wikivoyage feed skips them too.

200 tests (8 new). The new tests fail on the 1.2 code.

## 1.2 (September 24, 2026)

### Travel search

- Search several places at once, separated by commas ("Japan, Tuscany"), or by "or". Each place is searched separately and their guides take turns in the feed.
- Only guides whose title or introduction names the place are shown, in relevance order, without phrasebooks.
- A misspelled place that finds nothing offers a correction ("Search for “Japan”").
- When every matching guide has been shown, the feed says so and offers the same place in any trip style, all destinations, or new filters. It no longer stops silently.
- An ⓘ button next to "Country or region" explains how the search works.

### Fixes

- Travel filters kept working after Wikimedia rate-limited the browser's own requests (they come from WikiScroll's server).
- Clear filters and Explore destinations close Settings with the full close animation.

192 tests (8 new). The new tests, and one updated translation test, fail on the 1.1 code.

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
