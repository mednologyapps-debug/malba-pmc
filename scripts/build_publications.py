"""MALBA editorial library, rendered from the same CMS publication snapshot."""
import json,re
import build_academia as b

def defaults():
    return json.loads((b.ROOT/'content/publicaciones.json').read_text(encoding='utf-8'))

def content(data):
    section=data.get('publications') or defaults()
    return {**section,'book':{**defaults()['book'],**section.get('book',{})}}

def validate(section):
    if not isinstance(section,dict):raise ValueError('Publicaciones: contenido inválido.')
    for key in ('title','subtitle','image','imageSmall','imageAlt','catalogTitle','catalogText'):
        if not isinstance(section.get(key),str) or not section[key].strip():raise ValueError('Publicaciones: completa '+key+'.')
    book={**defaults()['book'],**section.get('book',{})}
    for key in ('title','subtitle','description','author','image','imageSmall','imageAlt','format','deliveryNote'):
        if not isinstance(book[key],str) or not book[key].strip():raise ValueError('Libro: completa '+key+'.')
    if book['currency'] not in ('PEN','USD'):raise ValueError('Moneda del libro inválida.')
    if not isinstance(book['available'],bool):raise ValueError('Disponibilidad del libro inválida.')
    price=book['price']
    if price is not None and (isinstance(price,bool) or not isinstance(price,(int,float)) or not 0<price<100000):raise ValueError('Indica un precio válido para el libro.')
    for key in ('checkoutUrl','previewUrl','productUrl'):
        if not isinstance(book[key],str):raise ValueError('Enlace del libro inválido.')
        if book[key] and not book[key].startswith('https://'):raise ValueError('Usa un enlace HTTPS para el libro.')
        if book[key]:b.safe_url(book[key])
    if book['available'] and (price is None or not book['checkoutUrl']):raise ValueError('Para habilitar la compra del libro indica precio y URL de pago.')
    for key in ('image','imageSmall'):b.safe_url(book[key])
    if not isinstance(book['chapters'],list) or not 1<=len(book['chapters'])<=20 or any(not isinstance(x,dict) or any(not isinstance(x.get(k),str) or not x[k].strip() for k in ('title','description')) for x in book['chapters']):raise ValueError('Completa los temas del libro.')
    if not isinstance(book['benefits'],list) or not 1<=len(book['benefits'])<=12 or any(not isinstance(x,str) or not x.strip() for x in book['benefits']):raise ValueError('Completa los beneficios del libro.')
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
    section={**section,'book':{**defaults()['book'],**section.get('book',{})}}
    validate(section);prefix='../';items=[p for p in section['items'] if p.get('visibility','public')=='public']
    book=section['book'];enabled=book['available'];currency='S/' if book['currency']=='PEN' else 'USD'
    price=f"{currency} {book['price']:,.2f}" if book['price'] is not None else 'Precio por confirmar'
    destination=book['checkoutUrl'] if enabled else book['productUrl']
    button='Continuar al pago' if enabled else 'Consultar disponibilidad'
    chapters=''.join(f'<details class="book-chapter"><summary><span>{i:02}</span>{b.esc(x["title"])}<span aria-hidden="true">+</span></summary><p>{b.esc(x["description"])}</p></details>' for i,x in enumerate(book['chapters'],1))
    benefits=''.join('<li>'+b.esc(x)+'</li>' for x in book['benefits'])
    preview=f'<a class="book-preview-link" href="{b.esc(book["previewUrl"])}" target="_blank" rel="noopener noreferrer">Ver muestra del libro <span aria-hidden="true">↗</span></a>' if book['previewUrl'] else ''
    main=f'''<div class="publications-page"><section class="book-store" aria-labelledby="book-heading">{b.picture(section['image'],section['imageSmall'],'',prefix,'book-store-background',True)}<div class="section-container"><nav class="book-breadcrumb" aria-label="Ruta de navegación"><a href="../">Inicio</a><span aria-hidden="true">/</span><span>Publicaciones</span><a href="#revistas">Ir a las revistas ↓</a></nav><div class="book-store-layout"><div class="book-editorial"><div class="book-introduction"><div class="book-cover-stage">{b.picture(book['image'],book['imageSmall'],book['imageAlt'],prefix,'',True)}{preview}</div><div class="book-intro-copy"><h1 id="book-heading">{b.esc(book['title'])}</h1><p class="book-byline">Por <strong>{b.esc(book['author'])}</strong></p><p class="book-lead">{b.esc(book['subtitle'])}</p><p>{b.esc(book['description'])}</p><div class="book-highlights"><span><strong>7</strong> capítulos</span><span><strong>+200</strong> factores clave</span><span><strong>Casos</strong> prácticos</span></div><a class="book-mobile-link" href="#comprar-libro">Ver opciones de compra →</a></div></div><section class="book-content-panel" aria-labelledby="book-content-heading"><h2 id="book-content-heading">Una guía para llevar a tu proyecto</h2><p>Un enfoque aplicado a la planificación, el control y la gestión de riesgos en infraestructura eléctrica.</p><div class="book-benefit-grid"><div><h3>Qué encontrarás</h3><ul>{benefits}</ul></div><div><h3>Para quién es</h3><p>Directores de proyectos, ingenieros, equipos de planificación y control, profesionales de PMO y quienes quieren fortalecer su gestión de proyectos de transmisión.</p></div></div><h3 class="book-topics-title">Explora los temas del libro</h3>{chapters}<p class="book-content-note">Una selección de temas para conocer su enfoque. Revisa la muestra para explorar el contenido.</p></section><section class="book-author-panel"><img src="../assets/people/miguel-alba.webp" alt="Miguel Alba" width="264" height="396" loading="lazy"><div><h2>La experiencia detrás del libro</h2><p>Miguel Alba comparte aprendizajes de la gestión de proyectos de transmisión eléctrica para acercar la práctica profesional a quienes dirigen y ejecutan proyectos.</p><strong>{b.esc(book['author'])} · MALBA PMC</strong></div></section></div><aside class="book-purchase" id="comprar-libro" aria-labelledby="book-purchase-heading"><div class="book-order-card"><h2 id="book-purchase-heading">Tu próximo recurso de gestión</h2><p class="book-order-title">{b.esc(book['title'])}</p><p class="book-price">{b.esc(price)}</p><div class="book-format"><span aria-hidden="true">▤</span><div><strong>{b.esc(book['format'])}</strong><span>Español · Primera edición</span></div><span aria-hidden="true">✓</span></div><div class="book-order-summary"><span>Disponibilidad</span><strong>{'Compra habilitada' if enabled else 'Por confirmar'}</strong></div><p class="book-delivery-note">{b.esc(book['deliveryNote'])}</p><a class="button button-purple book-checkout" href="{b.esc(destination)}">{button} <span aria-hidden="true">→</span></a><p class="book-checkout-note">{'Completa tus datos y realiza el pago en la tienda MALBA.' if enabled else 'Revisa la disponibilidad actual en la tienda MALBA.'}</p><div class="book-order-assistance"><strong>¿Quieres conocerlo primero?</strong>{preview}</div></div><a class="book-magazine-link" href="#revistas">También puedes leer nuestras revistas ↓</a></aside></div></div></section><section class="publication-catalog section-container" id="revistas" aria-labelledby="publication-catalog-title"><div class="publication-heading"><div><h2 id="publication-catalog-title">{b.esc(section['catalogTitle'])}</h2><p>{b.esc(section['catalogText'])}</p></div><span class="publication-count">{len(items)} {'edición' if len(items)==1 else 'ediciones'} · PDF</span></div><div class="publication-grid">'''
    for p in items:
        url=b.esc(b.local(p['pdfUrl'],prefix))
        main+=f'''<article class="publication-card"><a class="publication-cover" href="{url}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true">{b.picture(p['image'],p['imageSmall'],'',prefix)}</a><div class="publication-copy"><div class="publication-meta"><span>{b.esc(p['edition'])}</span><span>{p['pages']} páginas</span></div><h3><a href="{url}" target="_blank" rel="noopener noreferrer">{b.esc(p['title'])}</a></h3><p>{b.esc(p['description'])}</p><a class="button button-purple" href="{url}" target="_blank" rel="noopener noreferrer">Leer revista <span aria-hidden="true">↗</span><span class="sr-only">: {b.esc(p['title'])}, PDF en una nueva pestaña</span></a></div></article>'''
    if not items:main+='<p class="publication-empty">Estamos preparando nuevas publicaciones. Vuelve pronto para descubrirlas.</p>'
    main+='</div></section></div>'
    schema={'@context':'https://schema.org','@graph':[{'@type':'Book','name':book['title'],'description':book['description'],'author':{'@type':'Person','name':book['author']},'inLanguage':'es','image':b.ORIGIN+book['image']},{'@type':'CollectionPage','name':section['catalogTitle'],'description':section['subtitle'],'url':b.ORIGIN+'publicaciones/'},{'@type':'ItemList','itemListElement':[{'@type':'ListItem','position':i,'item':{'@type':'DigitalDocument','name':p['title'],'description':p['description'],'url':p['pdfUrl'] if p['pdfUrl'].startswith('https://') else b.ORIGIN+p['pdfUrl'],'encodingFormat':'application/pdf','inLanguage':'es','publisher':{'@type':'Organization','name':'MALBA PMC'}}} for i,p in enumerate(items,1)]},{'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Inicio','item':b.ORIGIN},{'@type':'ListItem','position':2,'name':'Publicaciones','item':b.ORIGIN+'publicaciones/'}]}]}
    return {'publicaciones/index.html':b.document('Libro y publicaciones',book['subtitle'],'publicaciones/',prefix,main,programs,'publications',schema,section['image'],section['imageAlt'])}
