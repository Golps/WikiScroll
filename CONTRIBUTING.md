# Forking and contributing

Thanks for your interest in WikiScroll.

## About this repository

This repository publishes the source code behind [wikiscroll.com](https://wikiscroll.com) so that people can see how it's built and use it as a starting point for their own projects. It is a **reference snapshot**, not an actively maintained open-source project:

- The live site is developed and deployed separately, by hand, to Cloudflare Workers. Nothing here deploys automatically.
- Issues and pull requests are welcome, but they may not get a response or be merged.

## Forking

Forks are encouraged. The code is [MIT-licensed](LICENSE); the WikiScroll name and logo are not. To get started:

1. Follow [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) to run it locally.
2. Read [Make it your own](docs/DEVELOPMENT.md#make-it-your-own). It lists the domain, name, keys and branding to change before you deploy.
3. Use your own name and logo for a public deployment, so readers don't confuse your version with wikiscroll.com.
4. Keep the attribution to Wikipedia, Wikivoyage and the other sources in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## The ideas behind it

If you build on WikiScroll, these principles explain many of its design decisions. You're free to make different choices in your own fork:

- **No engagement-driven personalization.** Likes save articles; they never shape the feed.
- **No streaks, daily targets or pressure to return.**
- **No accounts, ads or tracking.** Reader data stays in the browser.
- **Wikimedia content stays attributed.** Every card links to its source article.
- **Calm, accurate copy.** Describe what a feature does, without hype.

## If you do open a pull request

- Keep it focused on one change, and explain what it does and how you tested it.
- Run `node --test test/*.test.js`, and check the change on a phone-sized viewport and on desktop.
- Follow the [conventions](docs/DEVELOPMENT.md#conventions): remove leftovers, bump asset versions and translate new labels.
- Don't include API keys, account IDs, personal data or screenshots of dashboards.

## Security

Please report security problems with wikiscroll.com privately, as described in [SECURITY.md](SECURITY.md).
