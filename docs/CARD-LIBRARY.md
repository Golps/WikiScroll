# Card library

The card library is a prebuilt set of English Wikipedia cards stored in Cloudflare R2 and served from `cards.wikiscroll.com`. It lets the feed draw from millions of ready cards without calling the Wikimedia API. This page covers how it is built and how to set it up. The browser does not read it yet; that is a separate change.

## How a build works

`.github/workflows/card-library.yml` runs every Tuesday (and on demand) on GitHub Actions:

1. Finds the newest weekly CirrusSearch index dump for `enwiki_content` on dumps.wikimedia.org. If that dump is already live, the run stops, so a rerun never repeats uploads.
2. Downloads the `page_props` dump (lead images, short descriptions, disambiguation flags).
3. Streams the search-index dump through `scripts/build-library.mjs`, which:
   - turns each article into a card in the feed's `{id, src, title, body, img, url, desc}` shape, using the same rules as the starter pool (`scripts/build-starter.mjs`): an image is required, and lists, disambiguation pages and short introductions are left out;
   - converts each page's `popularity_score` (its share of the week's views) into average daily views with English Wikipedia's daily total, then groups it with the Worker's own depth bands (`DEPTH_BANDS`). Pages with unknown readership never count as Obscure;
   - puts the vital articles into Popular (Level 3) and Known (Level 4 minus Level 3), matching titles through redirects;
   - shuffles every set across all of its cards and packs them into gzipped shards of 100.
4. Uploads the shards under `v1/en/<dump date>/<set>/<n>.json`, then writes `v1/en/current.json`, which points readers at the new build. After that, it deletes the previous build.

A thin build (fewer cards than `MINIMUM`), a failed download or a missing upstream list fails the job before anything is uploaded, and the current library keeps serving.

## Staying inside the free tier

R2's free tier includes 10 GB of storage, 1 million writes and 10 million reads a month, and egress is free.

- **Writes:** a build is refused at more than `MAX_FILES` (190,000) shards, so five weekly builds a month stay under 1 million. A dump that is already live is never rebuilt unless the run is started with *force*.
- **Storage:** a build is refused at more than `MAX_BYTES` (4.5 GB), so the old and new builds together stay under 10 GB during the swap. Only one build is kept.
- **Reads:** shards never change and are cached for a year, and the manifest for 5 minutes. With the cache rule below, most downloads never reach R2.

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
