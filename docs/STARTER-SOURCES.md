# Starter pool sources

`public/data/starter/` holds the bundled outage and offline cards for all 15 library languages. `scripts/build-starter.mjs` samples it from the [card library](CARD-LIBRARY.md) on `cards.wikiscroll.com`, taking random whole shards of the matching library set, and `.github/workflows/starter-pool.yml` reruns it every Monday a few hours after the library build. A language is resampled only when its library build changes (English weekly, the others about every three weeks), so each weekly commit stays around 5 MB of JSON; `--all` resamples every language. If the English library can't be read or a set comes up short, English falls back to the English Wikipedia and Wikivoyage Action APIs, as described below; another language keeps its previous pool. `index.json` records when the pool was fetched, the library build each language came from (`builds`), and how many shards each set has.

| Set | Source (library sets match the live API fallback) |
|---|---|
| `wiki-en-1` Popular | Vital articles, level 3 |
| `wiki-en-2` Known | Vital articles, level 4 (excluding level 3) |
| `wiki-en-3` Balanced, `wiki-en-4` Lesser-known, `wiki-en-5` Obscure | Random articles with a lead image, grouped by their 14-day average readership using the Worker's own depth bands |
| `how-en` | Random Wikivoyage guides, excluding phrasebooks, disambiguation pages and travel topics |

Every other library language has the same sets under its own code (`wiki-de-3`, `how-de`, …), sampled from that language's library. Korean, Arabic and Hindi have no Wikivoyage, so they have no travel set and their readers get `how-en`, as they do online. Cards keep the library's `mature` flag, and the reader hides them unless Settings → Mature topics is on.

English sets hold up to 300 cards and other languages' sets 120, in shards of 60: about 11,500 cards and 11 MB in all (3.5 MB compressed). A reader loads one random shard of their own language and depth, so visitors see different cards, and never a shard from another language. During a Wikimedia outage a depth without shards borrows that language's Balanced cards. An English set with fewer than 120 cards, or another language's set with fewer than 60, keeps that language's previous pool; a thin travel set outside English is left out.

The service worker caches only `index.json` at install. Once the feed is up, the page names its language's six sets and the service worker saves one random shard of each set it doesn't hold yet (about 100–250 KB compressed, once per device and language), so offline openings work without downloading other languages. Topic and Help-only feeds have no starter sets.

Old pools stay in Git history, which grows by about 90 MB a year. After each run the workflow reads the repository's size from the GitHub API and opens (or comments on) a "Repository past the size warning" issue once it reaches 500 MB, about half of GitHub's suggested 1 GB. The fix then is to build the pool during the deploy or to trim its history.

Every card keeps its source URL and Wikimedia thumbnail URL. See the original article for contributors and licensing. Excerpts are plain text and may be shortened. Session deduplication excludes repeats.
