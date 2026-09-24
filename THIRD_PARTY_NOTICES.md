# Third-party notices and attribution

WikiScroll's own code is released under the [MIT License](LICENSE). The WikiScroll name and logo are not covered by that license. The content, data, fonts and services listed below keep their own licenses and terms.

## Not affiliated with Wikimedia

WikiScroll is an independent project. It is not affiliated with, sponsored by or endorsed by the Wikimedia Foundation. *Wikipedia* and *Wikivoyage* are trademarks of the Wikimedia Foundation. They are used here only to name the sources that WikiScroll reads from.

## Wikipedia and Wikivoyage content

The app fetches article text and images from Wikimedia at runtime. It doesn't host them, and it links every card to its original article.

This repository does include some Wikimedia text:

| Path | Content | License |
|---|---|---|
| `public/data/starter-en.json` | Opening excerpts from 33 English Wikipedia articles and 33 English Wikivoyage guides, retrieved in September 2026 ([details](docs/STARTER-SOURCES.md)) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Each entry includes its source URL; the authors are listed in that article's page history. The excerpts may have been shortened. |
| `docs/images/*` screenshots | Screenshots of the app showing article excerpts and photographs | See [docs/images/ATTRIBUTION.md](docs/images/ATTRIBUTION.md) |

The starter file contains image *URLs*, not image files. **Images on Wikimedia don't all share one license.** Each photo has its own terms on its Wikimedia Commons file page, and some English Wikipedia images are non-free and may only be used under that site's fair-use rules. Anyone reusing screenshots or images must check each file's page.

## Fonts

| Font | Where | License |
|---|---|---|
| DM Serif Display (Colophon Foundry; derived from Adobe Source Serif) | `worker/fonts/DMSerifDisplay-Regular.ttf`, used to render shared-collection preview images | [SIL Open Font License 1.1](worker/fonts/OFL.txt) |

The web interface uses the fonts already installed on each device and loads no web fonts.

## Map and geographic data

| Source | Used for | Terms |
|---|---|---|
| [Natural Earth](https://www.naturalearthdata.com/) 1:50m land and country geometry | `branding/*.geojson`, drawn as the globe on the share image | Public domain ([terms](https://www.naturalearthdata.com/about/terms-of-use/)) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors | Map data behind the basemap tiles | ODbL 1.0. Attribution is shown on every map. |
| [CARTO](https://carto.com/attributions) basemaps | Map tiles in Wikivoyage mode | [CARTO's terms](https://carto.com/legal). Attribution is shown on every map. |
| [Nominatim](https://nominatim.org/) | Fallback place search when a guide has no coordinates | [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) |

## Software

Loaded at runtime (not included in this repository):

| Library | Version | License | Source |
|---|---|---|---|
| [Leaflet](https://leafletjs.com/) | 1.9.4 | BSD-2-Clause | cdnjs, loaded the first time a map opens |

npm dependencies (installed from the lockfile, not included in this repository):

| Package | Version | License | Role |
|---|---|---|---|
| [`@resvg/resvg-wasm`](https://github.com/yisibl/resvg-js) | 2.6.2 | MPL-2.0 | Renders shared-collection preview images in the Worker. The Worker bundle includes this unmodified package. |
| [`wrangler`](https://github.com/cloudflare/workers-sdk) | 4.134.0 | MIT OR Apache-2.0 | Development and deployment tool |

## Services

The live site runs on [Cloudflare Workers](https://workers.cloudflare.com/) and can load [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) when it's configured. Article data comes from the [Wikimedia APIs](https://api.wikimedia.org/), used under their terms and API etiquette: a descriptive `User-Agent`, bounded concurrency, and respect for `Retry-After`.
