"""Prepare static robots/sitemap and explicitly switch public pages to index."""
from __future__ import annotations
import argparse
import re
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = [p for p in ROOT.rglob("*.html") if not ({"dashboard", "aula-virtual", "verificar-certificado"} & set(p.parts))]

def route(path: Path) -> str:
    rel = path.relative_to(ROOT)
    return "/" if rel == Path("index.html") else "/" + "/".join(rel.parts[:-1]) + "/"

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-url", default="https://malba-pmc.com")
    parser.add_argument("--production", action="store_true")
    args = parser.parse_args()
    base = args.site_url.rstrip("/")
    robots = 'index, follow' if args.production else 'noindex, follow'
    for path in PUBLIC:
        text = path.read_text(encoding="utf-8")
        text = re.sub(r'<meta name=["\']robots["\'] content=["\']noindex,?\s*follow["\']\s*/?>',
                      f'<meta name="robots" content="{robots}" />', text, flags=re.I)
        path.write_text(text, encoding="utf-8")
    urls = sorted({route(p) for p in PUBLIC})
    body = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    body += [f"  <url><loc>{escape(base + u)}</loc></url>" for u in urls]
    body.append('</urlset>')
    (ROOT / "sitemap.xml").write_text("\n".join(body) + "\n", encoding="utf-8")
    (ROOT / "robots.txt").write_text(
        "User-agent: *\nAllow: /\nDisallow: /dashboard/\nDisallow: /aula-virtual/\nDisallow: /verificar-certificado/\n"
        f"Sitemap: {base}/sitemap.xml\n", encoding="utf-8")
    print(f"SEO preparado para {base}: {len(urls)} URLs")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
