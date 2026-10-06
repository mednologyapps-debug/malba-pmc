"""MALBA editorial library, rendered from the same CMS publication snapshot."""
import json,re
import build_academia as b

def defaults():
    return json.loads((b.ROOT/'content/publicaciones.json').read_text(encoding='utf-8'))

def content(data):
    return data.get('publications') or defaults()

def validate(section):
    if not isinstance(section,dict):raise ValueError('Publicaciones: contenido inválido.')
    for key in ('title','subtitle','image','imageSmall','imageAlt','catalogTitle','catalogText'):
        if not isinstance(section.get(key),str) or not section[key].strip():raise ValueError('Publicaciones: completa '+key+'.')
    items=section.get('items');seen=set()
    if not isinstance(items,list) or len(items)>150:raise ValueError('Publicaciones: máximo 150 registros.')
    for p in items:
        if not isinstance(p,dict):raise ValueError('Publicación inválida.')
        for key in ('id','title','edition','description','image','imageSmall','imageAlt','pdfUrl'):
            if not isinstance(p.get(key),str) or not p[key].strip():raise ValueError('Publicación: completa '+key+'.')
        if not re.fullmatch(r'[a-z0-9-]{2,80}',p['id']) or p['id'] in seen:raise ValueError('Identificador de publicación inválido o duplicado.')
        seen.add(p['id'])
        if p.get('visibility','public') not in ('public','hidden','deleted'):raise ValueError('Visibilidad de publicación inválida.')
        if isinstance(p.get('pages'),bool) or not isinstance(p.get('pages'),int) or not 1<=p['pages']<=3000:raise ValueError('Indica un número válido de páginas.')
        url=b.safe_url(p['pdfUrl'])
        if not url.startswith('https://') and (not url.startswith('assets/') or not url.lower().endswith('.pdf') or not (b.ROOT/url).is_file()):raise ValueError('El archivo PDF de la publicación no existe.')
    for key in ('image','imageSmall'):
        b.safe_url(section[key])

def render_publications(section,programs):
    validate(section);prefix='../';items=[p for p in section['items'] if p.get('visibility','public')=='public'];latest=items[0] if items else None
    visual=''
    if latest:
        visual=f'''<a class="publication-hero-feature" href="{b.esc(b.local(latest['pdfUrl'],prefix))}" target="_blank" rel="noopener noreferrer" aria-label="Leer {b.esc(latest['title'])} en PDF, abre en una nueva pestaña"><div class="publication-book">{b.picture(latest['image'],latest['imageSmall'],latest['imageAlt'],prefix,'',True)}</div><span><strong>{b.esc(latest['edition'])}</strong> Leer revista <span aria-hidden="true">↗</span></span></a>'''
    main=f'''<div class="publications-page"><section class="publication-hero">{b.picture(section['image'],section['imageSmall'],'',prefix,'publication-background',True)}<div class="section-container publication-hero-layout"><div><h1>{b.esc(section['title'])}</h1><p>{b.esc(section['subtitle'])}</p><a class="button button-white" href="#revistas">Explorar publicaciones <span aria-hidden="true">↓</span></a></div>{visual}</div></section><section class="publication-catalog section-container" id="revistas" aria-labelledby="publication-catalog-title"><div class="publication-heading"><div><h2 id="publication-catalog-title">{b.esc(section['catalogTitle'])}</h2><p>{b.esc(section['catalogText'])}</p></div><span class="publication-count">{len(items)} {'edición' if len(items)==1 else 'ediciones'} · PDF</span></div><div class="publication-grid">'''
    for p in items:
        url=b.esc(b.local(p['pdfUrl'],prefix))
        main+=f'''<article class="publication-card"><a class="publication-cover" href="{url}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true">{b.picture(p['image'],p['imageSmall'],'',prefix)}</a><div class="publication-copy"><div class="publication-meta"><span>{b.esc(p['edition'])}</span><span>{p['pages']} páginas</span></div><h3><a href="{url}" target="_blank" rel="noopener noreferrer">{b.esc(p['title'])}</a></h3><p>{b.esc(p['description'])}</p><a class="button button-purple" href="{url}" target="_blank" rel="noopener noreferrer">Leer revista <span aria-hidden="true">↗</span><span class="sr-only">: {b.esc(p['title'])}, PDF en una nueva pestaña</span></a></div></article>'''
    if not items:main+='<p class="publication-empty">Estamos preparando nuevas publicaciones. Vuelve pronto para descubrirlas.</p>'
    main+='</div></section></div>'
    schema={'@context':'https://schema.org','@graph':[{'@type':'CollectionPage','name':section['catalogTitle'],'description':section['subtitle'],'url':b.ORIGIN+'publicaciones/'},{'@type':'ItemList','itemListElement':[{'@type':'ListItem','position':i,'item':{'@type':'DigitalDocument','name':p['title'],'description':p['description'],'url':p['pdfUrl'] if p['pdfUrl'].startswith('https://') else b.ORIGIN+p['pdfUrl'],'encodingFormat':'application/pdf','inLanguage':'es','publisher':{'@type':'Organization','name':'MALBA PMC'}}} for i,p in enumerate(items,1)]},{'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Inicio','item':b.ORIGIN},{'@type':'ListItem','position':2,'name':'Publicaciones','item':b.ORIGIN+'publicaciones/'}]}]}
    return {'publicaciones/index.html':b.document(section['catalogTitle'],section['subtitle'],'publicaciones/',prefix,main,programs,'publications',schema,section['image'],section['imageAlt'])}
