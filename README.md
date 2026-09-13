# nl-toc

A static copy of the Nimble Learn blog post
[Recent News in Analytics and AI: June 2026 Edition](https://www.nimblelearn.com/blog/recent-news-in-analytics-and-ai-june-2026/),
used as a baseline for prototyping a table-of-contents feature on top of the
existing article layout.

Hosted on GitHub Pages.

## Layout

```
index.html        the mirrored page (built, committed)
assets/           every image, icon and font the page references
scripts/mirror.py rebuilds index.html from the live page
```

## Refreshing the copy

```bash
python3 scripts/mirror.py
```

The script fetches the live page, downloads its assets into `assets/`, and
rewrites `index.html` to point at the local copies. Assets already on disk are
kept, so delete `assets/` first for a clean pull.

## What the mirror changes

The source is a Gatsby site, so the copy is not byte-identical to what the
server sends:

- **Gatsby hydration is stripped.** Without its page-data JSON, the runtime
  would rehydrate and blank the server-rendered DOM. The markup is left as
  static HTML.
- **Third-party scripts are stripped** — Iubenda cookie consent, Google Tag
  Manager, Cloudflare Rocket Loader. Rocket Loader's mangled `type` attributes
  are restored on whatever survives.
- **AOS scroll animations are pinned open.** The "Recent articles" block is
  revealed by AOS from the stripped bundle, so a small override in
  `<style id="nl-toc-static-overrides">` holds `[data-aos]` blocks visible.
- **Asset URLs are rewritten** from `/static/...` to `assets/static/...` so the
  page works from a project subpath on GitHub Pages.
- **Site navigation points back at the live site** — links like `/about/`
  become `https://www.nimblelearn.com/about/`, since only this one page is
  mirrored.

All page CSS is inlined by Gatsby in the source, so there is no separate
stylesheet to mirror.

## Adding the TOC

Article sections are the `<h2>` elements inside `.entry-content`. They carry no
`id` attributes in the source, so anchors need generating.
