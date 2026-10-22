# Security policy

## Reporting a vulnerability

Please report security problems **privately**, not in public issues, discussions or pull requests.

Use GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Only the maintainer can see the report.

Please include:

- what the issue is and where it is (a URL, endpoint or file),
- steps to reproduce it, or a proof of concept,
- the impact you expect,
- whether you would like to be credited.

You should receive an acknowledgement within 7 days. Please allow reasonable time for a fix to be deployed to wikiscroll.com before you disclose the issue publicly.

## Scope

In scope:

- The WikiScroll Worker and front end in this repository, and their deployment at `wikiscroll.com`.
- Injection or escaping problems in shared collections, article previews or the app.
- Ways to bypass rate limits or make the Worker do unbounded work against Wikimedia.
- Exposure of credentials or personal data through this repository or the site.

Out of scope:

- Vulnerabilities in Wikipedia, Wikivoyage or other Wikimedia services. Report those to the [Wikimedia Foundation](https://www.mediawiki.org/wiki/Reporting_security_bugs).
- Problems in Cloudflare, CARTO, OpenStreetMap or other third-party services themselves.
- Missing security headers or best practices without a demonstrated impact.
- Denial-of-service attacks by traffic volume. Please don't load-test the live site.

## Supported versions

Security reports are handled for the live site at wikiscroll.com. This repository is a snapshot of its source and may lag behind the deployed version.
