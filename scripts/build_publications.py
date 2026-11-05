"""MALBA editorial library, rendered from the same CMS publication snapshot."""
import json,re
import build_academia as b

def defaults():
    return json.loads((b.ROOT/'content/publicaciones.json').read_text(encoding='utf-8'))

def upgrade_book(book):
    merged={**defaults()['book'],**book}
    if 'physicalPrice' not in book:merged['physicalPrice']=book.get('price')
    if 'physicalCheckoutUrl' not in book:merged['physicalCheckoutUrl']=book.get('checkoutUrl','')
    for key in ('physicalPrice','digitalPrice'):
        if merged[key] is None:merged[key]=defaults()['book'][key]
    return merged

def content(data):
    section=data.get('publications') or defaults()
    return {**section,'book':upgrade_book(section.get('book',{}))}

def validate(section):
    if not isinstance(section,dict):raise ValueError('Publicaciones: contenido inválido.')
    for key in ('title','subtitle','image','imageSmall','imageAlt','catalogTitle','catalogText'):
        if not isinstance(section.get(key),str) or not section[key].strip():raise ValueError('Publicaciones: completa '+key+'.')
    book=upgrade_book(section.get('book',{}))
    for key in ('title','subtitle','description','author','image','imageSmall','imageAlt','format','deliveryNote'):
        if not isinstance(book[key],str) or not book[key].strip():raise ValueError('Libro: completa '+key+'.')
    if book['currency'] != 'PEN':raise ValueError('La compra del libro se realiza en soles.')
    if not isinstance(book['available'],bool):raise ValueError('Disponibilidad del libro inválida.')
    price=book['price']
    if price is not None and (isinstance(price,bool) or not isinstance(price,(int,float)) or not 0<price<100000):raise ValueError('Indica un precio válido para el libro.')
    for key in ('checkoutUrl','previewUrl','productUrl'):
        if not isinstance(book[key],str):raise ValueError('Enlace del libro inválido.')
        if book[key] and not book[key].startswith('https://'):raise ValueError('Usa un enlace HTTPS para el libro.')
        if book[key]:b.safe_url(book[key])
    import math
    for key in ('physicalPrice','digitalPrice','physicalShipping'):
        value=book[key]
        if value is not None and (isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0 or value>=100000 or key!='physicalShipping' and value==0):raise ValueError('Importe inválido del libro: '+key)
    for key in ('physicalCheckoutUrl','digitalCheckoutUrl'):
        if not isinstance(book[key],str) or book[key] and not book[key].startswith('https://'):raise ValueError('Usa una URL HTTPS de pago para cada formato.')
        if book[key]:b.safe_url(book[key])
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
    section={**section,'book':upgrade_book(section.get('book',{}))}
    validate(section);prefix='../';items=[p for p in section['items'] if p.get('visibility','public')=='public']
    book=section['book'];currency='S/' if book['currency']=='PEN' else 'USD'
    def amount(value):return f'{currency} {value:,.2f}' if value is not None else '—'
    purchase=checkout_panel(book,amount)
    chapters=''.join(f'<details class="book-chapter"><summary><span>{i:02}</span>{b.esc(x["title"])}<span aria-hidden="true">+</span></summary><p>{b.esc(x["description"])}</p></details>' for i,x in enumerate(book['chapters'],1))
    benefits=''.join('<li>'+b.esc(x)+'</li>' for x in book['benefits'])
    preview=f'<a class="book-preview-link" href="{b.esc(book["previewUrl"])}" target="_blank" rel="noopener noreferrer">Ver muestra del libro <span aria-hidden="true">↗</span></a>' if book['previewUrl'] else ''
    main=f'''<div class="publications-page"><section class="book-store" aria-labelledby="book-heading">{b.picture(section['image'],section['imageSmall'],'',prefix,'book-store-background',True)}<div class="section-container"><nav class="book-breadcrumb" aria-label="Ruta de navegación"><a href="../">Inicio</a><span aria-hidden="true">/</span><span>Publicaciones</span></nav><div class="book-store-layout"><div class="book-editorial"><div class="book-introduction"><div class="book-cover-stage">{b.picture(book['image'],book['imageSmall'],book['imageAlt'],prefix,'',True)}{preview}</div><div class="book-intro-copy"><h1 id="book-heading">{b.esc(book['title'])}</h1><p class="book-byline">Por <strong>{b.esc(book['author'])}</strong></p><p class="book-lead">{b.esc(book['subtitle'])}</p><p>{b.esc(book['description'])}</p><div class="book-highlights"><span><strong>7</strong> capítulos</span><span><strong>+200</strong> factores clave</span><span><strong>Casos</strong> prácticos</span></div><a class="book-mobile-link" href="#comprar-libro">Comprar el libro</a></div></div><section class="book-content-panel" aria-labelledby="book-content-heading"><h2 id="book-content-heading">Una guía para llevar a tu proyecto</h2><p>Un enfoque aplicado a la planificación, el control y la gestión de riesgos en infraestructura eléctrica.</p><div class="book-benefit-grid"><div><h3>Qué encontrarás</h3><ul>{benefits}</ul></div><div><h3>Para quién es</h3><p>Directores de proyectos, ingenieros, equipos de planificación y control, profesionales de PMO y quienes quieren fortalecer su gestión de proyectos de transmisión.</p></div></div><h3 class="book-topics-title">Explora los temas del libro</h3>{chapters}<p class="book-content-note">Una selección de temas para conocer su enfoque. Revisa la muestra para explorar el contenido.</p></section><section class="book-author-panel"><img src="../assets/people/miguel-alba.webp" alt="Miguel Alba" width="264" height="396" loading="lazy"><div><h2>La experiencia detrás del libro</h2><p>Miguel Alba comparte aprendizajes de la gestión de proyectos de transmisión eléctrica para acercar la práctica profesional a quienes dirigen y ejecutan proyectos.</p><strong>{b.esc(book['author'])} · MALBA PMC</strong></div></section><section class="publication-catalog" id="revistas" aria-labelledby="publication-catalog-title"><div class="publication-heading"><div><h2 id="publication-catalog-title">{b.esc(section['catalogTitle'])}</h2><p>{b.esc(section['catalogText'])}</p></div><span class="publication-count">{len(items)} {'edición' if len(items)==1 else 'ediciones'} · PDF</span></div><div class="publication-grid">'''
    for p in items:
        url=b.esc(b.local(p['pdfUrl'],prefix))
        main+=f'''<article class="publication-card"><a class="publication-cover" href="{url}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true">{b.picture(p['image'],p['imageSmall'],'',prefix)}</a><div class="publication-copy"><div class="publication-meta"><span>{b.esc(p['edition'])}</span><span>{p['pages']} páginas</span></div><h3><a href="{url}" target="_blank" rel="noopener noreferrer">{b.esc(p['title'])}</a></h3><p>{b.esc(p['description'])}</p><a class="button button-purple" href="{url}" target="_blank" rel="noopener noreferrer">Leer revista <span aria-hidden="true">↗</span><span class="sr-only">: {b.esc(p['title'])}, PDF en una nueva pestaña</span></a></div></article>'''
    if not items:main+='<p class="publication-empty">Estamos preparando nuevas publicaciones. Vuelve pronto para descubrirlas.</p>'
    main+='</div></section></div>'+purchase+'</div></div></section></div>'
    schema={'@context':'https://schema.org','@graph':[{'@type':'Book','name':book['title'],'description':book['description'],'author':{'@type':'Person','name':book['author']},'inLanguage':'es','image':b.ORIGIN+book['image']},{'@type':'CollectionPage','name':section['catalogTitle'],'description':section['subtitle'],'url':b.ORIGIN+'publicaciones/'},{'@type':'ItemList','itemListElement':[{'@type':'ListItem','position':i,'item':{'@type':'DigitalDocument','name':p['title'],'description':p['description'],'url':p['pdfUrl'] if p['pdfUrl'].startswith('https://') else b.ORIGIN+p['pdfUrl'],'encodingFormat':'application/pdf','inLanguage':'es','publisher':{'@type':'Organization','name':'MALBA PMC'}}} for i,p in enumerate(items,1)]},{'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Inicio','item':b.ORIGIN},{'@type':'ListItem','position':2,'name':'Publicaciones','item':b.ORIGIN+'publicaciones/'}]}]}
    return {'publicaciones/index.html':b.document('Libro y publicaciones',book['subtitle'],'publicaciones/',prefix,main,programs,'publications',schema,section['image'],section['imageAlt']).replace('publicaciones.css"','publicaciones.css?v=20261105-original"').replace('</head>','<script src="../publicaciones.js?v=20261105-original" defer></script></head>')}

def checkout_panel(book,amount):
    return f'''<aside class="book-purchase" id="comprar-libro" aria-labelledby="book-purchase-heading"><form class="book-order-card book-checkout-form" id="book-checkout-form" method="post" novalidate data-price="{book['physicalPrice']}"><h2 id="book-purchase-heading">Compra tu libro</h2><section class="book-checkout-step" data-step="1" aria-labelledby="book-summary-heading"><h3 id="book-summary-heading" tabindex="-1"><span>1</span> Resumen del pedido</h3><p class="book-summary-title">{b.esc(book['title'])}</p><div class="book-launch-notice"><span class="book-launch-dot"></span><span>Precio especial por lanzamiento</span></div><dl class="book-price-lines"><div class="book-total-line"><dt><span class="book-price-label">Precio de lanzamiento</span><small>Libro físico</small></dt><dd class="book-price-value">{amount(book['physicalPrice'])}</dd></div></dl><p class="book-original-price" hidden>Precio regular: <s class="book-regular-value"></s></p><p class="book-summary-footnote"><strong>Recojo presencial:</strong> Consejo Nacional del Colegio de Ingenieros del Perú. Sin envío a domicilio.</p></section><fieldset class="book-checkout-step book-contact" data-step="2"><legend tabindex="-1"><span>2</span> Información de contacto</legend><label>Nombre completo<input name="billing_full_name" autocomplete="name" required maxlength="120" placeholder="Tu nombre y apellidos"></label><label>Correo electrónico<input name="billing_email" type="email" autocomplete="email" required maxlength="254" placeholder="nombre@correo.com"></label><div class="book-contact-row"><label>WhatsApp o celular<input name="billing_phone" type="tel" autocomplete="tel" required maxlength="30" placeholder="+51 …"></label></div><div class="book-receipt"><label>Tipo de comprobante<select name="receipt_type" required><option value="boleta">Boleta</option><option value="factura">Factura</option></select></label><div id="book-boleta-fields"><label>DNI <small>(opcional)</small><input name="billing_dni" inputmode="numeric" pattern="[0-9]{{8}}" maxlength="8" placeholder="8 dígitos" title="Ingresa un DNI de 8 dígitos"></label></div><div id="book-invoice-fields" class="book-invoice-fields" hidden><label>RUC<input name="billing_ruc" inputmode="numeric" pattern="[0-9]{{11}}" maxlength="11" placeholder="11 dígitos" title="Ingresa un RUC de 11 dígitos" required disabled></label><label>Razón social<input name="billing_company" maxlength="200" placeholder="Nombre de la empresa" required disabled></label><label class="book-fiscal-address">Dirección fiscal<input name="billing_address_1" maxlength="250" placeholder="Dirección de la empresa" required disabled></label></div></div><div class="book-consents"><label><input name="terms_accepted" type="checkbox" value="yes" required><span>He leído y acepto la <a href="../evento/presentacion-libro/privacidad.html" target="_blank" rel="noopener">política de privacidad</a> para gestionar mi compra.</span></label></div></fieldset><p class="book-checkout-error" id="book-checkout-error" role="alert" hidden></p><button class="button button-purple book-checkout" type="submit" disabled>Continuar al pago seguro</button><p class="book-checkout-note">Revisa el importe antes de pagar con Izipay.</p><noscript><p>Activa JavaScript para continuar con tu compra.</p></noscript></form></aside>'''
