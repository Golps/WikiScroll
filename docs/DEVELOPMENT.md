# Development

How to run WikiScroll locally, configure it, test it, and deploy your own copy to Cloudflare Workers.

- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Configuration](#configuration)
- [Tests and checks](#tests-and-checks)
- [Deploying](#deploying)
- [Conventions](#conventions)

## Requirements

- **Node.js 22 or newer.** The pinned Wrangler version requires it.
- **pnpm**, matching the committed `pnpm-lock.yaml`. `npm install` also works but ignores the lockfile.
- A **Cloudflare account**, only if you want to deploy. Local development doesn't need one.

## Run locally

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` runs `wrangler dev`, which serves the Worker and the static files in `public/` at <http://localhost:8787>. Local development simulates the rate-limit bindings and the edge cache. Article data comes live from Wikimedia, so you need a network connection that can reach `*.wikipedia.org` and `*.wikivoyage.org`. Without it, the API returns `503` with a JSON error, and the app shows its retry state or the bundled English starter set.

There is no front-end build step. Edit `public/*` and reload. When you test offline behavior, remember that the service worker caches assets: use a private window, or bypass the service worker in your browser's developer tools.

## Configuration

WikiScroll uses a few settings. None of the maintainer's values are in this repository.

| Setting | Where | Visibility | Needed for |
|---|---|---|---|
| `CARTO_BASEMAP_KEY` | constant in `public/app.js` | **Public**: sent by every browser that loads a map | Optional. Maps load without it; a key ties map usage to your CARTO account. |
| `WEB_ANALYTICS_TOKEN` | Worker variable (`.dev.vars` locally, dashboard in production) | **Public** once injected into pages | Optional Cloudflare Web Analytics beacon |
| `CLOUDFLARE_API_TOKEN` | `.env` or the shell environment | **Secret** | Deploying |
| `CLOUDFLARE_ACCOUNT_ID` | `.env` or the shell environment | Private | Deploying |

Some values are **browser-visible keys**. They end up in every visitor's browser, so they can't be kept secret. Protect them by restricting where they work, for example the allowed domains for your CARTO key. The production values are still left out of this repository, so contributors use their own keys and forks don't run on the maintainer's quota.

**Private credentials** (the API token and, as a precaution, the account ID) belong only in your environment or a git-ignored `.env` file. Never put them in code, configuration or screenshots.

To set up your own:

```bash
cp .env.example .env              # deployment credentials (git-ignored)
cp .dev.vars.example .dev.vars    # optional Worker variables for wrangler dev (git-ignored)
```

Maps work out of the box: with an empty `CARTO_BASEMAP_KEY`, tiles load from CARTO's public basemaps. For a public deployment, create a CARTO key restricted to your domain, set it in `CARTO_BASEMAP_KEY`, and check [CARTO's terms](https://carto.com/legal) for your expected traffic.

## Tests and checks

```bash
node --test test/*.test.js   # the full suite, ~2 seconds, no network needed
pnpm check                   # syntax check of the main scripts, then the suite
```

[ENGINEERING.md](ENGINEERING.md#testing) explains what the suite covers and what it doesn't. Please also check changes by hand in a real browser, on a phone-sized viewport and on desktop. Test with reduced motion enabled and in a right-to-left language (Hebrew or Arabic) when your change affects layout.

## Deploying

WikiScroll is deployed **directly to Cloudflare Workers** with Wrangler. There is no GitHub Pages site and no automatic deployment from this repository; wikiscroll.com itself is deployed by hand.

### 1. Create a narrowly scoped API token

In the Cloudflare dashboard, create an **Account API token** with the least access that can deploy one Worker:

- **Permission:** edit access to Workers scripts. Where Cloudflare offers per-resource scoping, limit the token to the single Worker (`wikiscroll`, or the name you use) instead of all Workers in the account.
- **No other permissions.** No zone, DNS, account-settings or user permissions are needed. A custom domain is connected once in the dashboard, and deployments keep it.
- **Optional:** add a client IP filter and an expiry date.

With a token scoped to one Worker, Wrangler reports an error with code `10000` on `/workers/subdomain` *after* uploading, because checking the account-wide workers.dev setting needs broader access. `scripts/deploy.sh` recognizes this case and reports the live version instead of failing. Don't give the token more access just to hide the message.

### 2. Adjust `wrangler.jsonc` for your copy

- `name`: your Worker's name. `scripts/deploy.sh` looks for `Uploaded wikiscroll` in Wrangler's output, so update that too if you rename the Worker.
- `ratelimits`: keep the three bindings (`REQUEST_LIMIT`, `WORK_LIMIT`, `RENDER_LIMIT`). The Worker refuses expensive work without them.
- `keep_vars: true` keeps variables set in the dashboard (such as `WEB_ANALYTICS_TOKEN`) across deploys.
- The account ID is read from `CLOUDFLARE_ACCOUNT_ID`, so it isn't in this file.

The code assumes the `wikiscroll.com` domain in share links, canonical URLs and internal cache keys. A deployment on another domain works but will produce links to `wikiscroll.com` until you change these.

### 3. Deploy

```bash
node --test test/*.test.js   # always test first
bash scripts/deploy.sh       # reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the environment or .env
```

Afterwards, load the live site and confirm it serves the new asset versions.

To use a different Wrangler binary from the one in `node_modules` (for example, in a container that shares a `node_modules` folder built for another operating system), set `WRANGLER_BIN` to its path.

## Static hosting (GitHub Pages and similar)

wikiscroll.com runs on Cloudflare Workers, and that is the complete setup. The front end can also run **without the Worker**, as plain files on any static host (GitHub Pages, Netlify, an ordinary web server). When `/api/*` isn't available, the browser falls back to calling the Wikipedia and Wikivoyage APIs directly, with its own deadlines, request limits and rate-limit handling.

These results come from serving `public/` as static files in a desktop browser:

| Works without the Worker | Needs the Worker |
|---|---|
| Random Wikipedia and Wikivoyage feeds | Topic filters |
| All five depth steps. *Popular* and *Known* are approximated by readership instead of Wikipedia's vital-article lists. | Help Wikipedia (tags and "Only these articles") |
| All 15 languages | Wikivoyage travel filters |
| Saved articles, collections, history, stats | "On this day" badges and surprises |
| Ambient mode, themes, gestures, keyboard shortcuts | Shared collection pages and their preview images |
| Maps | Link previews for shared articles in messaging apps |
| Installation as an app, offline reading, the bundled starter set | Edge caching, request coalescing and server-side rate limits |

In static mode every reader's browser talks to Wikimedia directly, and the controls that need the Worker stay visible but won't load results.

**Security headers.** `public/_headers` (security headers and the Content Security Policy) is read by Cloudflare and Netlify. GitHub Pages can't set custom headers, so a copy there runs without them; the app works the same, with less protection against injected scripts.

**Serve it from the root of a domain.** The app uses root-relative paths (`/app.js`, `/sw.js`, `/images/…`), so it must be served at `/`. On GitHub Pages, that means a custom domain or a `username.github.io` repository. A project site at `username.github.io/repo/` would need those paths rewritten first.

**Publish `public/` as the site.** GitHub Pages can publish a branch's root or `docs/` folder, or deploy any folder through GitHub Actions. With Actions, a minimal workflow in your fork looks like this:

```yaml
# .github/workflows/pages.yml (in your fork)
name: Deploy static site
on: workflow_dispatch          # run by hand; add `push` if you want automatic deploys
permissions: {contents: read, pages: write, id-token: write}
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: github-pages
    steps:
      - uses: actions/checkout@v4
      - uses: actions/upload-pages-artifact@v3
        with: {path: public}
      - uses: actions/deploy-pages@v4
```

This workflow isn't included in this repository, because wikiscroll.com is deployed to Cloudflare by hand. It's an example for your own fork.

**Turning it on, step by step (in your fork):**

1. Add the workflow above as `.github/workflows/pages.yml`.
2. In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
3. For a custom domain, enter it under **Settings → Pages → Custom domain** and follow GitHub's DNS instructions. Without one, the repository must be named `username.github.io` (see "Serve it from the root of a domain" above).
4. Run **Deploy static site** from the **Actions** tab. Run it again after each change you want to publish.

**Don't use the "Deploy from a branch → /docs" option.** In this repository `docs/` holds documentation, not the app. Publishing it would put these Markdown files online instead of WikiScroll, and GitHub already displays them in the repository.

**Maps.** Maps work without a key. If you add one, restrict it to your own domain and set it in `CARTO_BASEMAP_KEY` (see [Configuration](#configuration)). Every visitor can see it.

Before publishing a static copy, also apply the relevant items in [Make it your own](#make-it-your-own). In particular, the collection share button builds `wikiscroll.com` links.

## Make it your own

WikiScroll was written for one deployment, at `wikiscroll.com`. Before deploying a fork publicly, change the following:

| What | Where |
|---|---|
| **Domain in links and previews** | `public/features.js` (collection share URL), `public/app.js` (`deepLinkUrl` and `doShare` fallbacks), `worker/collections.js` (canonical and preview-image URLs), `worker/index.js` (default preview image in `renderUnfurl`) |
| **Domain in cache keys** | `worker/collections.js`, `worker/today.js`, `worker/verified.js`, `worker/vital.js` (the `https://wikiscroll.com/__…` keys). Use your own domain. |
| **User-Agent** | `worker/index.js`, `worker/today.js`, `worker/verified.js`. Wikimedia asks for a descriptive `User-Agent` with contact information (a URL or an email address) that points to you, not to wikiscroll.com. |
| **Page metadata** | `public/index.html` and `public/about/index.html` (title, canonical URL, Open Graph and structured data, contact address), `public/manifest.json`, `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt` |
| **Name and logo** | `branding/` sources, then `node scripts/build-branding.mjs`. The wordmark is also embedded in `worker/wordmark.js` for generated images. |
| **Worker name** | `name` in `wrangler.jsonc`, and the `Uploaded wikiscroll` check in `scripts/deploy.sh` |
| **Map key** | `CARTO_BASEMAP_KEY` in `public/app.js`: optional, but recommended for public deployments, restricted to your domain |
| **Content Security Policy** | `PAGE_CSP` in `worker/security.js` and the `/*` block of `public/_headers`. Update both if you add a script, map-tile, analytics or API host. |
| **Tests** | Several tests use `https://wikiscroll.com` as an example origin. They still pass, but update them if you change behavior that depends on the domain. |

Please use your own name and logo for a public deployment, so readers can tell your project apart from wikiscroll.com, and keep the attribution to Wikimedia and the other sources in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Conventions

- **Remove leftovers.** When you remove or replace a feature, remove its styles, scripts, translations and tests in the same change. `test/unused-css.test.js` fails on style rules that nothing uses. Delete the rule instead of silencing the test.
- **Version static assets.** When a file in `public/` changes, bump its `?v=` number in `index.html`, update the matching entry in the `SHELL` list in `sw.js`, and bump the `CACHE` name there. When a dictionary in `public/translations/` changes, bump `VERSION` in `public/lang.js` (and `lang.js`'s own `?v=`), then the dictionary entries in `SHELL`.
- **Keep mirrored tables identical.** `VIEW_SCALE`, the Wikivoyage language list, `HELP_LANGS` and the language list (`worker/languages.js`) exist in both the Worker and `app.js`. Change both; tests compare them.
- **No inline scripts or handlers.** The Content Security Policy blocks them. Attach behavior with `addEventListener`; for images that may fail, use `data-fallback` (see `app.js`). New external hosts must be added to `PAGE_CSP` in `worker/security.js` and to `public/_headers`; a test keeps the two identical.
- **Preserve storage keys.** The `ws_*` `localStorage` keys and the `wikiscroll` IndexedDB database hold readers' libraries. Add migrations; never rename keys.
- **Translate new labels.** Add every new interface string to all 14 files in `public/translations/`. A message that includes a collection name or a number needs a template entry (`"Added to \"{name}\""`) and a matching pattern in `public/i18n.js`. `test/i18n.test.js` fails when a toast message has no translation.
- **About content.** Edit `public/about/index.html`, then run `node scripts/build-about.mjs` to copy it into the in-app dialog.
- **Branding.** Edit the sources in `branding/`, then run `node scripts/build-branding.mjs` (after `pnpm install`) to regenerate icons and the share image. With unchanged sources, it reproduces the committed images byte for byte.
- **Wording.** Keep product copy calm and factual. Describe only what the app does today.
