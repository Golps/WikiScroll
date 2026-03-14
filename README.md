# WikiScroll

**Infinite Wikipedia & Wikivoyage discovery — swipe to explore the world's knowledge.**

WikiScroll is a TikTok-style article discovery app that serves random Wikipedia and Wikivoyage articles as full-screen, swipeable cards. Swipe right to save, left to skip, scroll to explore. Zero accounts, zero tracking, runs entirely in your browser.

🌐 **[wikiscroll.com](https://wikiscroll.com)**

![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-F38020?style=flat&logo=cloudflare&logoColor=white)
![Vanilla JS](https://img.shields.io/badge/Vanilla%20JS-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Wikipedia API](https://img.shields.io/badge/Wikipedia%20API-000000?style=flat&logo=wikipedia&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?style=flat&logo=pwa&logoColor=white)

---

## Discovery

- 👆 **Swipe to discover** — Tinder-style gestures on mobile, arrow keys on desktop
- 🔀 **Two modes** — Wikipedia (encyclopedia) and Wikivoyage (travel destinations)
- 🌍 **14 languages** — including English, Spanish, French, Japanese, Arabic, and more
- 🎯 **Topic filtering** — Science, History, Geography, Arts, Technology, Sports, Food, People
- 🔬 **Article depth slider** — Dial from mainstream hits to deep obscure cuts
- 🐇 **Rabbit Hole mode** — Hit "Go Deeper" to chain through related articles
- ⭐ **On This Day** — Articles connected to today's date get a golden badge and pulsing star

## Personalization

- ❤️ **Save & organize** — Like articles, create named collections, track reading history
- 🌙 **Ambient reading** — Long-press any card for a fullscreen immersive reading experience
- 🔥 **Streaks & heatmap** — Daily reading counter with a 7-day activity heatmap
- 🎨 **Dark & light themes**
- 🗺️ **Interactive maps** — Wikivoyage articles include a pinpointed Leaflet.js map

## Sharing & Platform

- 🔗 **Deep linking** — Share any article as a direct URL (e.g. `wikiscroll.com/?a=w12345`)
- 📸 **Rich link previews** — Shared links generate dynamic Open Graph tags for beautiful social cards
- 🔄 **Pull to refresh** — Rubber-band physics, fresh articles every time
- 📱 **PWA installable** — Add to home screen, works offline
- ⌨️ **Keyboard shortcuts** — Full desktop navigation (arrows, L, S, R, D, M, Space, Esc)

---

## Architecture

```
wikiscroll/
├── index.html              ← The entire app (~166KB)
├── functions/              ← Cloudflare Workers (auto-deployed)
│   ├── [[path]].js         ← Dynamic OG tags for shared links
│   └── api/
│       ├── articles.js     ← Edge-cached article queue
│       ├── featured.js     ← Daily featured article
│       ├── related.js      ← Rabbit Hole cache
│       ├── search.js       ← Article search
│       ├── image-proxy.js  ← Wikipedia image CORS proxy
│       ├── analytics.js    ← View counts (needs KV)
│       └── trending.js     ← Trending feed (needs KV)
├── images/                 ← OG images, PWA icons, favicon
└── manifest.json           ← PWA manifest
```

## Built With

| Layer | Tech |
|-------|------|
| Frontend | Vanilla HTML, CSS, JavaScript — zero dependencies |
| Fonts | [DM Sans](https://fonts.google.com/specimen/DM+Sans) + [Syne](https://fonts.google.com/specimen/Syne) |
| Data | Wikipedia REST API, Wikivoyage REST API |
| Maps | Leaflet.js + Nominatim (OpenStreetMap) |
| Hosting | Cloudflare Pages |
| Edge compute | Cloudflare Pages Functions |
| Storage | localStorage (all data stays on-device) |

## Privacy

Zero personal data collected. No accounts, no cookies, no tracking. All preferences, likes, history, and collections live in your browser's localStorage and never leave your device.

---

<details>
<summary><strong>🚀 Deploy Your Own</strong></summary>

<br>

1. Fork this repo
2. Connect it to [Cloudflare Pages](https://pages.cloudflare.com)
3. Set build output directory to `/` (root)
4. Deploy — that's it

Workers in `functions/` deploy automatically.

</details>

---

Found a bug or have a feature idea? [Open an issue](https://github.com/golps/wikiscroll/issues) — all feedback welcome.

Built with curiosity and Wikipedia's open API.
