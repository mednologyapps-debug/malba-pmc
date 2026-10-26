"""Audit public MALBA HTML before a release."""
from __future__ import annotations
import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {"dashboard", "aula-virtual", "verificar-certificado", "cms-preview"}
PUBLIC_ROUTES = {
    "/", "/academia/", "/academia/proximos/", "/publicaciones/",
    "/soluciones-digitales/", "/consultoria/", "/quienes-somos/",
    "/gestion-de-proyectos-de-transmision-electrica/",
    "/gestion-de-riesgos-de-proyectos-de-transmision-electrica/",
    "/diseno-implementacion-y-mejora-de-pmo/",
    "/soluciones-digitales/simulador-de-gestion-de-proyectos/",
    "/soluciones-digitales/malba-risk/",
    "/consultoria-en-gestion-de-proyectos-de-transmision-electrica/",
    "/consultoria-en-gestion-de-riesgos-de-proyectos-de-transmision-electrica/",
}

def pages():
    for path in ROOT.rglob("*.html"):
        if any(part in EXCLUDED for part in path.relative_to(ROOT).parts):
            continue
        yield path

def route(path: Path) -> str:
    rel = path.relative_to(ROOT)
    return "/" if rel == Path("index.html") else "/" + "/".join(rel.parts[:-1]) + "/"

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--production", action="store_true")
    args = parser.parse_args()
    errors, seen, count = [], {}, 0
    for path in pages():
        r = route(path)
        if r not in PUBLIC_ROUTES:
            continue
        count += 1
        text = path.read_text(encoding="utf-8")
        checks = [
            (r"<title>\s*([^<]+?)\s*</title>", "title"),
            (r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)', "description"),
            (r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', "canonical"),
        ]
        for pattern, name in checks:
            if not re.search(pattern, text, re.I):
                errors.append(f"{r}: falta {name}")
        if not re.search(r"<h1\b", text, re.I):
            errors.append(f"{r}: falta H1")
        has_noindex = bool(re.search(r"noindex", text, re.I))
        if args.production and has_noindex:
            errors.append(f"{r}: todavía contiene noindex")
        if not args.production and not has_noindex:
            errors.append(f"{r}: debe permanecer noindex en staging")
        title = re.search(checks[0][0], text, re.I)
        if title:
            value = title.group(1).strip().lower()
            if value in seen:
                errors.append(f"title duplicado: {r} y {seen[value]}")
            seen[value] = r
    print(f"Páginas públicas auditadas: {count}")
    for error in errors:
        print("ERROR:", error)
    if not errors:
        print("SEO estructural: OK")
    return 1 if errors else 0

if __name__ == "__main__":
    raise SystemExit(main())
