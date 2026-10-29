# Card library

The card library is a prebuilt set of Wikipedia and Wikivoyage cards, one library for each of the site's 15 languages, stored in Cloudflare R2 and served from `cards.wikiscroll.com`. It lets the feed draw from millions of ready cards without calling the Wikimedia API. This page covers how it is built, how the site reads it, and how to set it up.

## How a build works

`.github/workflows/card-library.yml` runs on GitHub Actions early every Monday, the day after Wikimedia publishes its weekly dump, and on demand. Each Monday it builds English and `PER_WEEK` (5) of the other 14 languages in turn (`ROTATION`, by week number, so each is rebuilt about every three weeks), each in its own job, processed sequentially; a manual run takes a `languages` list. Every job does the same steps for its own wiki (`<lang>wiki`, `<lang>wikivoyage`); English names are used below:

1. Finds the newest weekly CirrusSearch index dump for `enwiki_content` on dumps.wikimedia.org. If that dump is already live, the run stops, so a rerun never repeats uploads.
2. Downloads the twice-monthly table dumps: `page_props` (lead images, short descriptions, disambiguation flags), `page` and `categorylinks` (plus `linktarget` where the dump uses it) for the category tree and talk-page photo requests, `image` for the files uploaded to that wiki itself (every other photo links to Commons), and the English Wikivoyage search-index dump with its `page_props`.
3. Streams the search-index dump through `scripts/build-library.mjs`, which builds one set of cards for every feed the site offers:
   - **Depth (`wiki-en-1` … `wiki-en-5`):** cards with an image, like the live random feed. Each page's `popularity_score` (its share of the week's views) times English Wikipedia's average daily views gives its readership, grouped with the Worker's `DEPTH_BANDS`; pages with unknown readership never count as Obscure. Popular and Known are the vital articles (Level 3, and Level 4 minus Level 3), matched through redirects.
   - **Topics (`topic-en-<topic>-<depth>`):** pages in a topic's root categories (`roots` in `worker/topics.js`) or up to two levels below them (three for Niche and Obscure), as the live category walk reaches, with the topic feeds' own readership bands.
   - **Help Wikipedia (`help-en-<type>-<depth>`):** pages whose hidden maintenance categories (`NEED_CATEGORIES`) or talk-page photo requests match a Help type. Every card in every set carries its maintenance tags (`needs`), in the live order.
   - **Mature topics:** a Wikipedia card whose categories, title or short description name sex, pornography, nudity or graphic abuse carries `mature: 1` (`worker/mature.js`). It stays in its sets; the reader skips it unless Settings → Mature topics is on (off by default). Live and starter cards get the same flag from their title and description, and the reader checks cards without a flag the same way.
   - **A topic with Help on (`topic-en-<topic>-help-<type>-<depth>`):** the topic cards that need that type of help, so the browser never sifts through topic cards for the few that match.
   - **Wikivoyage (`how-en`):** travel guides with a readable introduction, image optional, without phrasebooks or travel-topic pages.
   - **Travel place index (`places/<n>.json`):** every guide is listed under each place above it in Wikivoyage's breadcrumbs (`geocrumb-is-in` in `page_props`), so Japan lists Kyoto through Kansai. A place keeps its own guide first and then a random sample, up to `PLACE_CAP` (300). Places are keyed by their folded title, and also by the title without a "(…)" qualifier when no other place has that name. The keys are spread over `manifest.places` files by an FNV-1a hash (`placeHash`), about `PLACE_KEYS_PER_FILE` (150) per file. Each guide also carries the trip styles its title or introduction names (`styles`), using the live search's words (`TRAVEL_TERMS`).
   - Every set is shuffled across all of its cards and packed into gzipped shards of 100. Topic and Help sets keep a random sample of up to `SLICE_CAP` (40,000) cards each and topic-with-Help sets up to `COMBO_CAP` (10,000); the depth and travel sets keep every card.
4. Publishes through `scripts/publish-library.mjs`. Workflow runs share one concurrency group and language jobs run sequentially, so the bucket's shared write ledger cannot lose concurrent updates. The storage guard counts the whole bucket **plus** the incoming build, including the current library and retained versions, against `STORAGE_LIMIT` (9 GB). Only explicitly retired builds older than 24 hours may be removed first. Writes are reserved before uploading; failed attempts keep their reservation. After every shard uploads successfully, a retirement journal is saved and `v1/<lang>/current.json` switches readers to the new build. The previous build remains available for at least 24 hours; a later publication removes it after that grace period. Missing or corrupt accounting fails closed; only an object absent from a successful complete listing is treated as new. A published build ID is never overwritten.

Korean, Arabic and Hindi have no Wikivoyage, so their builds have no travel sets and their readers browse the English guides, as the live site does. Other languages use the same pipeline: the English vital-article lists and topic root categories are followed through interlanguage links to that wiki's titles, the depth bands are scaled by `VIEW_SCALE`, Help types use that wiki's maintenance categories, and mature topics use `MATURE_CATEGORY_LANG`. `MINIMUM` is scaled per language (`MINIMUM_SCALE`, `GUIDE_MINIMUM`).

A thin build (fewer cards than `MINIMUM`), a misread table, a failed download, a missing upstream list, or more than 5% broken links among the sampled images that answered (rate-limited checks are ignored) fails the job before anything is uploaded, and the current library keeps serving.

## How the site reads it

`public/app.js` (`fetchLibraryBatch`) reads `v1/<lang>/current.json` for each language in `LIBRARY_LANGS`, then one random shard of the set that matches the reader's settings, straight from `cards.wikiscroll.com`. These downloads never pass through the Worker, so they don't count against its daily request limit. Every Wikipedia setting and Wikivoyage browsing in those languages come from the library:

- Several topics or Help types: each draw picks one of the matching sets at random, so the feed mixes them.
- Each feed draws a shard only once and stays at the selected depth. Resetting the feed releases shard reservations along with discarded queued cards; returning to a setting can draw those cards again.
- An empty or exhausted selection shows "No more matching cards" with *Start over* and *Change settings*. It does not claim that every downloaded card was read. There is no automatic change of depth. A missing shard triggers one cache-revalidating manifest refresh and one retry before falling back.

Travel search stays live. When `/api/travel` fails (a 5xx or 429 answer, a timeout or a Worker pause), `fetchLibraryTravel` stands in. A place search reads that place's index file, alternating between places as the live search does, and a trip style keeps only guides tagged with it; a style alone draws travel shards and keeps the matching guides. Once a filter falls back it stays on the library until the feed is reset. Every requested place must resolve before the library can stand in. An unknown place, failed index download, or missing index leaves the live/retry path available; a successful subset cannot mark the whole search exhausted.

The Worker and the live API serve only what the library can't: other languages, a library language whose first build isn't uploaded yet (retried after 30 minutes), travel search, On this day, an older library without the reader's set, or a failed download (the library is retried a minute later). The offline starter pool stays the last resort.

## Staying inside the free tier

R2's free tier includes 10 GB of storage, 1 million writes and 10 million reads a month, and egress is free.

- **Writes:** a build is refused at more than `MAX_FILES` shards (95,000 for English, 40,000 for any other language). Each upload also records its writes in a monthly ledger in the bucket (`usage/writes-<YYYY-MM>.json`: every shard, the manifest and a margin for listings), and an upload that would take the month past `WRITE_LIMIT` (900,000) is refused. Language jobs and workflow runs are serialized; failed uploads retain their conservative write reservation. A dump that is already live is never rebuilt unless the run is started with *force*.
- **Storage:** builds are refused at more than `MAX_BYTES` (4.5 GB). Publication also refuses a peak above `STORAGE_LIMIT` (9 GB), counting old and new copies together and accounting-file headroom. It may defer an update when retention leaves insufficient room; it never deletes the active library to make room. Retired versions become eligible for cleanup after 24 hours.
- **Reads:** shards never change and are cached for a year, and the manifest for 5 minutes. With the cache rule below, most downloads never reach R2.
- **Early warning:** the daily *Usage check* workflow (`scripts/usage-check.mjs`) compares yesterday's Worker requests (free: 100,000 a day) and this month's R2 storage and operations with the free allowances, and opens an issue once any passes half. It needs a `CF_ANALYTICS_TOKEN` secret: a Cloudflare API token with only *Account Analytics: Read*. Until it is set the check is skipped.

Publication serialization trades build throughput for safe shared accounting. All publishers using this bucket must use this workflow; direct concurrent uploads outside it are unsupported. GitHub queues up to 100 runs with `queue: max`. No live bucket mutation occurs in tests.

## One-time setup

1. R2 → **Create bucket**: `wikiscroll-cards`, Standard storage.
2. Bucket → Settings → **Custom Domains**: connect `cards.wikiscroll.com`.
3. Bucket → Settings → **CORS policy**:
   ```json
   [{"AllowedOrigins":["https://wikiscroll.com","https://www.wikiscroll.com"],"AllowedMethods":["GET","HEAD"],"MaxAgeSeconds":86400}]
   ```
4. wikiscroll.com → Caching → **Cache Rules**: when Hostname equals `cards.wikiscroll.com`, mark the request **Eligible for cache**, and set Edge TTL to use the cache-control header. Cloudflare does not cache `.json` by default.
5. R2 → **Manage API tokens**: create an *Object Read & Write* token limited to `wikiscroll-cards`. In the GitHub repository's Actions secrets, add `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID` and `R2_BUCKET`. The account ID is kept as a secret so it stays out of public logs.

Without these secrets, the workflow still builds the library and reports its size, but skips the upload. A manual run with *upload* switched off does the same.

## Licensing

Card text is from Wikipedia under CC BY-SA 4.0, shortened to an excerpt, and every card links to its article. Images are not copied. Cards link to Wikimedia's own thumbnails, which keep their own licenses.
