#!/usr/bin/env python3
"""Mirror the Nimble Learn blog post into a self-contained static page.

Fetches the live page, strips the Gatsby hydration runtime and third-party
tag/consent scripts, downloads every asset it references, and rewrites the
markup to point at the local copies. The result is a single static index.html
that renders standalone on GitHub Pages.

Usage: python3 scripts/mirror.py [--source URL]
"""
from __future__ import annotations

import argparse
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urljoin, urlparse

SOURCE = "https://www.nimblelearn.com/blog/recent-news-in-analytics-and-ai-june-2026/"
ORIGIN = "https://www.nimblelearn.com"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# Root-relative paths under these prefixes are real files we mirror locally.
ASSET_PREFIXES = ("/static/", "/cf-fonts/", "/icons/", "/images/")
ASSET_FILES = ("/favicon-32x32.png", "/manifest.webmanifest")

# Script sources we drop outright: the Gatsby runtime (it would rehydrate and
# blank the page without its data JSON) and third-party tag/consent loaders.
DROP_SCRIPT_SRC = re.compile(
    r"(webpack-runtime|framework-|app-[0-9a-f]+\.js|rocket-loader"
    r"|iubenda|googletagmanager)",
    re.I,
)
DROP_SCRIPT_ID = re.compile(r"gatsby-(script-loader|chunk-mapping)", re.I)


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def collect_asset_paths(html: str) -> set[str]:
    """Every root-relative asset path in attributes, srcsets and url()."""
    found: set[str] = set()
    candidates: list[str] = []
    for attr in ("src", "href", "content", "data-suppressedsrc"):
        candidates += re.findall(rf'{attr}=["\']([^"\']+)["\']', html)
    for srcset in re.findall(r'srcset=["\']([^"\']+)["\']', html):
        candidates += [part.strip().split()[0] for part in srcset.split(",") if part.strip()]
    candidates += [m[1] for m in re.findall(r'url\((["\']?)([^)"\']+)\1\)', html)]

    for raw in candidates:
        path = raw.split("#")[0].split("?")[0].strip()
        if not path.startswith("/"):
            continue
        if path.startswith(ASSET_PREFIXES) or path in ASSET_FILES:
            found.add(path)
    return found


def download(path: str) -> tuple[str, bool]:
    dest = ASSETS / path.lstrip("/")
    if dest.exists() and dest.stat().st_size:
        return path, True
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        dest.write_bytes(fetch(urljoin(ORIGIN, path)))
        return path, True
    except Exception as exc:  # noqa: BLE001 - report and carry on
        print(f"  ! {path}: {exc}", file=sys.stderr)
        return path, False


def strip_scripts(html: str) -> str:
    """Remove hydration and third-party scripts, keeping the server-rendered DOM."""

    def repl(match: re.Match[str]) -> str:
        tag = match.group(0)
        opening = match.group(1)
        if DROP_SCRIPT_SRC.search(opening) or DROP_SCRIPT_ID.search(opening):
            return ""
        # Inline Gatsby bootstrapping and consent-gated blocks go too.
        if "_iub_cs_activate" in opening or "text/plain" in opening:
            return ""
        if "window.___" in tag or "iubenda" in tag or "gtag(" in tag:
            return ""
        return tag

    html = re.sub(r"<script([^>]*)>.*?</script>", repl, html, flags=re.S)
    html = re.sub(r"<script([^>]*)/>", repl, html)
    # Cloudflare Rocket Loader prefixes every script type with its own token so
    # the browser skips the tag; undo that on whatever survived, or the script
    # stays inert, and drop its leftover attribute noise.
    html = re.sub(r'type="[0-9a-f]{16,}-([^"]*)"', r'type="\1"', html)
    html = re.sub(r'\s*data-cf-settings="[^"]*"', "", html)
    return html


def localise(html: str) -> str:
    """Point asset URLs at ./assets and site links back at the live site."""
    # Assets: /static/foo.png -> assets/static/foo.png (query strings dropped).
    def asset_repl(match: re.Match[str]) -> str:
        quote, path = match.group(1), match.group(2)
        clean = path.split("?")[0]
        frag = ""
        if "#" in clean:
            clean, frag = clean.split("#", 1)
            frag = "#" + frag
        return f"{quote}assets{clean}{frag}"

    prefixes = "|".join(p.rstrip("/") for p in ASSET_PREFIXES)
    html = re.sub(rf'(["\'(])(({prefixes})/[^"\')]+)', asset_repl, html)
    for path in ASSET_FILES:
        html = html.replace(f'"{path}', '"assets' + path)
    html = re.sub(r'(assets/[^"\']*?)\?v=[0-9a-f]+', r"\1", html)

    # Remaining root-relative links are site pages we do not mirror.
    html = re.sub(r'href="/(?!/)', f'href="{ORIGIN}/', html)
    return html


# The table-of-contents feature lives in its own files so rebuilding the mirror
# never clobbers it; these tags are injected into the freshly fetched markup.
FEATURE_CSS = '<link rel="stylesheet" href="toc.css">'
FEATURE_JS = '<script src="toc.js" defer></script>'


def canonical_tag(source: str) -> str:
    """Point at the original article.

    The source page ships no canonical link. Adding one is right for a mirror
    on a different host, and it gives the share buttons the real article URL
    instead of wherever this copy is being served from.
    """
    return f'<link rel="canonical" href="{source}">'


# AOS reveals scroll-animated blocks by adding .aos-animate from JS that ships
# inside the Gatsby bundle we strip, so pin those blocks to their revealed
# state - otherwise "Recent articles" stays at opacity 0 forever.
STATIC_OVERRIDES = """<style id="nb-toc-static-overrides">
[data-aos] {
  opacity: 1 !important;
  transform: none !important;
  transition: none !important;
}
</style>"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=SOURCE)
    args = parser.parse_args()

    print(f"Fetching {args.source}")
    html = fetch(args.source).decode("utf-8")

    paths = sorted(collect_asset_paths(html))
    print(f"Downloading {len(paths)} assets")
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(download, paths))
    ok = sum(1 for _, good in results if good)
    print(f"  {ok}/{len(paths)} assets present")

    html = localise(strip_scripts(html))
    html = html.replace(
        "<head>",
        "<head>\n<!-- Static mirror of "
        f"{args.source} - see README.md. Built by scripts/mirror.py. -->",
        1,
    )
    html = html.replace(
        "</head>",
        STATIC_OVERRIDES + canonical_tag(args.source) + FEATURE_CSS + "</head>",
        1,
    )
    html = html.replace("</body>", FEATURE_JS + "</body>", 1)
    (ROOT / "index.html").write_text(html, encoding="utf-8")
    print(f"Wrote index.html ({len(html) // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
