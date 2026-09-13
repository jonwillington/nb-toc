# nb-toc

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
  `<style id="nb-toc-static-overrides">` holds `[data-aos]` blocks visible.
- **Asset URLs are rewritten** from `/static/...` to `assets/static/...` so the
  page works from a project subpath on GitHub Pages.
- **Site navigation points back at the live site** — links like `/about/`
  become `https://www.nimblelearn.com/about/`, since only this one page is
  mirrored.

All page CSS is inlined by Gatsby in the source, so there is no separate
stylesheet to mirror.

## The table of contents

The feature lives in two files that sit alongside the mirror rather than inside
it, so `mirror.py` can refetch the page without clobbering the work:

```
toc.css   layout and styling
toc.js    builds the list, scroll-spy, smooth scrolling
```

`mirror.py` injects the `<link>` and `<script>` tags into every rebuild.

### Behaviour

**Desktop (>= 1024px).** The post container becomes a two-column grid: a 260px
TOC on the left and the article on the right, with a 64px gap. At the 1200px
container this narrows the article from 1140px to 816px and shifts it right.
The TOC is sticky and stays in view while the article scrolls, with the current
section highlighted.

The article title and hero image still span the full container width - only the
body text is indented. To shift the title and hero right as well, drop the
`grid-column: 1 / -1` rule on `.nb-toc-layout .intro-section` in `toc.css` and
they will fall into the article column.

Beneath the contents list is a **Share via** row - LinkedIn, X, email and a
copy-link button, as 34px icon buttons. It sits inside the sticky wrapper, so
it travels with the TOC.

**Mobile (< 1024px).** The grid collapses and the TOC becomes a disclosure
above the article, closed by default, with the sticky behaviour off. The share
row sits outside the collapsible list, so sharing stays reachable without
expanding the contents first.

### How it works

- Headings come from `.blog-page .article-body h2` - eight sections in the
  current post. They carry no `id` in the source, so `toc.js` slugifies each
  title (`Microsoft Foundry` becomes `#microsoft-foundry`) and de-duplicates
  collisions.
- The site header is `position: fixed`, so its height is measured at runtime
  into `--nb-toc-header-offset`. That one variable drives both the sticky
  offset and the headings' `scroll-margin-top`, so anchor jumps land clear of
  the header instead of underneath it.
- Scroll-spy runs off a rAF-throttled passive scroll listener, marking the
  active link with `aria-current="true"`. At the bottom of the page the last
  section is pinned active, since a short final section never clears the
  offset on its own.
- `position: sticky` is on an inner wrapper, not the grid item: the item
  stretches to the row height, which is what gives the sticky element room to
  travel.
- Clicks scroll smoothly (honouring `prefers-reduced-motion`) and update the
  hash with `replaceState`, avoiding a history entry per section.
- Share links point at the **canonical article**, not at wherever this copy is
  served from. The source page ships no canonical tag, so `mirror.py` stamps
  one in pointing at the original post, and `toc.js` reads it (falling back to
  `location.href`). To share the prototype URL instead, drop the canonical
  injection in `mirror.py`.
- Share icons are inline SVG paths drawn in `currentColor`, so they inherit the
  link colours. The footer's own social icons are white-on-dark PNGs and would
  be invisible against the article background.
- Copy-link uses the async Clipboard API with a `execCommand` fallback for
  non-secure origins, and confirms via an `aria-live` status that clears after
  two seconds.

### Tuning

The knobs are custom properties at the top of `toc.css`:

| Property | Default | Controls |
|---|---|---|
| `--nb-toc-width` | `260px` | TOC column width |
| `--nb-toc-gap` | `64px` | Space between TOC and article |
| `--nb-toc-gutter` | `24px` | Gap below the header when pinned |
| `--nb-toc-header-offset` | measured | Fixed-header height (set by `toc.js`) |
