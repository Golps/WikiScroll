# Starter pool sources

`public/data/starter/` holds the bundled outage and offline cards. `scripts/build-starter.mjs` samples it from this week's [card library](CARD-LIBRARY.md) on `cards.wikiscroll.com`, taking random whole shards of the matching library set, and `.github/workflows/starter-pool.yml` reruns it every Monday a few hours after the library build. If the library can't be read or a set comes up short, it falls back to the English Wikipedia and Wikivoyage Action APIs, as described below. `index.json` records when the pool was fetched and how many shards each set has.

| Set | Source (library sets match the live API fallback) |
|---|---|
| `wiki-en-1` Popular | Vital articles, level 3 |
| `wiki-en-2` Known | Vital articles, level 4 (excluding level 3) |
| `wiki-en-3` Balanced, `wiki-en-4` Lesser-known, `wiki-en-5` Obscure | Random articles with a lead image, grouped by their 14-day average readership using the Worker's own depth bands |
| `how-en` | Random Wikivoyage guides, excluding phrasebooks, disambiguation pages and travel topics |

Each set holds up to 300 cards in shards of 60. A reader loads one random shard of their own depth, so visitors see different cards. During a Wikimedia outage a depth without shards borrows Balanced cards. A set with fewer than 120 cards fails the weekly job, which then keeps the previous pool.

Every card keeps its source URL and Wikimedia thumbnail URL. See the original article for contributors and licensing. Excerpts are plain text and may be shortened. Session deduplication excludes repeats.
