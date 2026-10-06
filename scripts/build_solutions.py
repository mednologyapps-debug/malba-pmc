"""Digital product catalog and SaaS landing pages, shared MALBA shell."""
import json
import re
from urllib.parse import urlsplit
import build_academia as b

CARD_FIELDS={'id','title','subtitle','description','image','imageSmall','imageAlt','statusLabel','features','ctaLabel','ctaUrl'}

def default_cards():
    source=json.loads((b.ROOT/'content/solutions.json').read_text(encoding='utf-8'))
    return [{**{k:p[k] for k in ('id','title','subtitle','description','image','imageSmall','features')},'imageAlt':p['title'],'statusLabel':p['status'],'ctaLabel':'Conocer solución','ctaUrl':'/soluciones-digitales/'+p['slug']+'/'} for p in source['solutions']]

def upgrade_cards(cards):
    defaults={p['id']:p['ctaUrl'] for p in default_cards()}
    return [{**p, 'ctaUrl':p.get('ctaUrl',defaults.get(p.get('id'),''))} if isinstance(p,dict) else p for p in cards]

def validate_target(url):
    if not isinstance(url,str) or not url.strip() or url!=url.strip() or len(url)>1500:
        raise ValueError('Indica la URL de Conocer solución.')
    if any(c.isspace() or ord(c)<32 for c in url) or '\\' in url:
        raise ValueError('Usa una URL HTTPS o una ruta interna que empiece por /.')
    parsed=urlsplit(url)
    if url.startswith('/') and not url.startswith('//') and not parsed.scheme and not parsed.netloc:
        from urllib.parse import unquote
        if any(part in ('.','..') for part in unquote(parsed.path).split('/')) or '\\' in unquote(parsed.path) or unquote(parsed.path).startswith('//'):
            raise ValueError('Ruta interna inválida.')
        return url
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('Usa una URL HTTPS o una ruta interna que empiece por /.')
    b.safe_url(url)
    return url

def validate_cards(cards):
    if not isinstance(cards,list) or not 1<=len(cards)<=30:raise ValueError('Puedes configurar entre una y 30 soluciones digitales.')
    seen=set()
    for p in cards:
        if not isinstance(p,dict) or set(p)!=CARD_FIELDS:raise ValueError('Soluciones digitales: solo se pueden editar los campos de la tarjeta.')
        if not isinstance(p['id'],str) or not re.fullmatch(r'[a-z][a-z0-9-]{0,79}',p['id']) or p['id'] in seen:raise ValueError('Solución digital inválida o duplicada.')
        seen.add(p['id'])
        validate_target(p['ctaUrl'])
        for k in CARD_FIELDS-{'id','features'}:
            if not isinstance(p[k],str) or not p[k].strip() or len(p[k])>1500:raise ValueError('Completa el campo de la tarjeta: '+k)
        if len(p['title'])>150 or len(p['subtitle'])>180 or len(p['statusLabel'])>60 or len(p['ctaLabel'])>60:raise ValueError('El título, estado o botón de la tarjeta es demasiado largo.')
        if not isinstance(p['features'],list) or not 1<=len(p['features'])<=6 or any(not isinstance(x,str) or not x.strip() or len(x)>250 for x in p['features']):raise ValueError('Indica entre uno y seis beneficios breves por tarjeta.')
        for k in ('image','imageSmall'):
            url=b.safe_url(p[k])
            if not url.startswith('https://') and (not url.startswith('assets/') or not (b.ROOT/url).is_file()):raise ValueError('La imagen de la tarjeta no existe.')
    return cards

def section_photo(data,key,prefix,eager=False):
    photo=data['backgrounds'][key]
    return b.picture(photo['image'],photo['imageSmall'],'',prefix,'digital-section-background',eager).replace('<picture','<picture aria-hidden="true"',1)

def contact(data,text):
    from urllib.parse import quote
    return data['contactUrl']+'?text='+quote(text)

def render_solutions(programs,cards=None):
    data=json.loads((b.ROOT/'content/solutions.json').read_text(encoding='utf-8'))
    cards=validate_cards(upgrade_cards(cards) if cards is not None else default_cards())
    catalog=cards
    outputs={}
    prefix='../'
    main=f'''<section class="digital-catalog-hero digital-photo-section">{section_photo(data,"hero",prefix,True)}<div class="section-container digital-hero-grid"><div><h1>{b.esc(data['title'])}</h1><p>{b.esc(data['description'])}</p><a class="button button-white" href="#simuladores">Explorar soluciones <span aria-hidden="true">↓</span></a></div><div class="digital-product-preview"><img src="{prefix}assets/solutions/simulador-1100.webp" width="1100" height="543" alt="Pantalla real de MALBA Simulator"></div></div></section><section class="digital-catalog digital-photo-section" id="simuladores">{section_photo(data,"catalog",prefix)}<div class="section-container"><div class="digital-heading"><h2>Herramientas para llevar tus proyectos más lejos</h2><p>Elige la experiencia que responde a tu siguiente desafío.</p></div><div class="digital-card-grid">'''
    for p in catalog:
        href=b.esc(prefix+p['ctaUrl'].lstrip('/') if p['ctaUrl'].startswith('/') else p['ctaUrl'])
        main+=f'''<article class="digital-product-card digital-card-{b.esc(p['id'])}"><a href="{href}" class="digital-card-image" tabindex="-1" aria-hidden="true">{b.picture(p['image'],p['imageSmall'],p['imageAlt'],prefix)}<span>{b.esc(p['statusLabel'])}</span></a><div class="digital-card-copy"><div class="digital-card-title">{('<img class="digital-card-isotype" src="'+prefix+'assets/solutions/simulator-isotipo.jpg" width="46" height="46" alt="">') if p['id']=='simulator' else '<span class="digital-card-monogram" aria-hidden="true">'+b.esc(p['title'][0].upper())+'</span>'}<div><h3><a href="{href}">{b.esc(p['title'])}</a></h3><p class="digital-card-subtitle">{b.esc(p['subtitle'])}</p></div></div><p>{b.esc(p['description'])}</p><ul class="digital-card-features">{''.join('<li>'+b.esc(x)+'</li>' for x in p['features'])}</ul><a href="{href}" class="button button-purple">{b.esc(p['ctaLabel'])} <span aria-hidden="true">→</span></a></div></article>'''
    main+='</div></div></section>'
    outputs['soluciones-digitales/index.html']=page(data['title'],data['description'],'',main,programs,'digital',data['solutions'][0]['image'])
    for p in data['solutions']:
        main=simulator(data,p) if p['id']=='simulator' else risk(data,p)
        outputs['soluciones-digitales/'+p['slug']+'/index.html']=page(p['title'],p['description'],p['slug']+'/',main,programs,'digital-'+p['id'],p['image'])
    return outputs

def page(title,description,path,main,programs,active,image):
    slug='soluciones-digitales/'+path;prefix='../../' if path else '../'
    schema={'@context':'https://schema.org','@graph':[{'@type':'WebPage','name':title,'description':description,'url':b.ORIGIN+slug},{'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Inicio','item':b.ORIGIN},{'@type':'ListItem','position':2,'name':'Soluciones digitales','item':b.ORIGIN+'soluciones-digitales/'}]+([{'@type':'ListItem','position':3,'name':title,'item':b.ORIGIN+slug}] if path else [])}]}
    return b.document(title,description,slug,prefix,'<div class="digital-page">'+main+'</div>',programs,active,schema,image)

def simulator(data,p):
    certificate=data['certificate']
    certificate_image='<figure class="saas-certificate-image"><img src="../../'+b.esc(certificate['image'])+'" width="1100" height="778" alt="'+b.esc(certificate['imageAlt'])+'" loading="lazy" decoding="async"></figure>'
    demo=contact(data,'Hola, deseo una demostración de MALBA Simulator para gestión de proyectos.')
    main='''<section class="saas-hero digital-photo-section">'''+section_photo(data,'hero','../../',True)+'''<div class="section-container saas-hero-grid"><div class="saas-hero-copy"><h1><span>Gestiona un proyecto.</span><span>Toma decisiones.</span><em>Mide su impacto.</em></h1><p>Entrena tus habilidades de dirección de proyectos en un caso integral de infraestructura eléctrica. Cada decisión cambia los costos, los plazos y el desempeño.</p><div class="saas-actions"><a class="button button-purple" href="#planes">Elegir mi plan <span aria-hidden="true">→</span></a><a class="button saas-button-light" href="#como-funciona">Ver cómo funciona <span aria-hidden="true">↓</span></a></div></div><div class="saas-screen-composition"><div class="saas-screen"><div class="saas-window-bar"><span aria-hidden="true">● ● ●</span><strong>MALBA Simulator</strong><span>Gestión de proyectos</span></div><img src="../../assets/solutions/simulador-1100.webp" width="1100" height="543" alt="Interfaz real de MALBA Simulator con las etapas del proyecto"></div><div class="saas-float saas-float-top"><span class="saas-float-symbol" aria-hidden="true">✓</span><div><strong>Decide por etapas</strong><span>Inicio, planificación, ejecución y cierre</span></div></div><div class="saas-float saas-float-bottom"><span class="saas-float-symbol" aria-hidden="true">↗</span><div><strong>Observa las consecuencias</strong><span>Costos, plazos y desempeño</span></div></div></div></div></section>
    <section class="saas-section saas-video-section digital-photo-section" id="como-funciona">'''+section_photo(data,'learning','../../',False)+'''<div class="section-container"><div class="digital-heading centered"><h2>Aprende gestión de proyectos tomando decisiones reales</h2><p>Dirige una subestación y una línea de transmisión a través de sus fases. Analiza el caso, elige una respuesta y aprende de sus consecuencias.</p></div><div class="saas-video-preview"><img src="../../assets/solutions/simulador-1100.webp" width="1100" height="543" alt="Vista de la plataforma MALBA Simulator" loading="lazy"><div><span class="saas-video-mark" aria-hidden="true">M</span><h3>Conoce MALBA Simulator</h3><p>Video de presentación · Próximamente</p><a class="button button-white" href="'''+b.esc(demo)+'''" target="_blank" rel="noopener noreferrer">Solicitar una demostración ↗</a></div></div></div></section>
    <section class="saas-section digital-photo-section saas-process-section">'''+section_photo(data,'steps','../../',False)+'''<div class="section-container"><div class="digital-heading centered"><h2>De la decisión al resultado</h2><p>Una experiencia de aprendizaje aplicada, de principio a fin.</p></div><div class="saas-steps">'''
    steps=[('Acceso con licencia','Activa tu acceso personal. Cada licencia está asociada a un correo y permite participar en la experiencia asignada.'),('Toma de decisiones','Revisa el caso y enfrenta decisiones técnicas, económicas y de gestión a lo largo del proyecto.'),('Impacto en resultados','Evalúa cómo tus elecciones afectan el presupuesto, el cronograma, los riesgos y el desempeño.'),('Aprendizaje y certificado','Revisa tus resultados y completa la experiencia para obtener tu certificado digital.')]
    main+=''.join(f'<article><span aria-hidden="true">{i:02}</span><h3>{title}</h3><p>{desc}</p></article>' for i,(title,desc) in enumerate(steps,1))
    main+='''</div></div></section><section class="saas-section saas-soft digital-photo-section" id="resultados">'''+section_photo(data,'results','../../',False)+'''<div class="section-container saas-result-grid"><div class="digital-heading"><h2>Tus decisiones tienen consecuencias.</h2><p>Más que responder preguntas: analiza restricciones, asigna recursos y toma decisiones sobre un proyecto de construcción eléctrica.</p><div class="saas-benefit"><span aria-hidden="true">↗</span><div><h3>Costos y plazos</h3><p>Comprende cómo una decisión modifica el presupuesto y el calendario del proyecto.</p></div></div><div class="saas-benefit"><span aria-hidden="true">◇</span><div><h3>Riesgos y desempeño</h3><p>Compara resultados y revisa los criterios que utilizaron tú y tu equipo.</p></div></div></div><figure class="saas-outcome-image"><img src="../../assets/solutions/simulador-1100.webp" width="1100" height="543" alt="Resultados reales de MALBA Simulator: costos, cronograma y desempeño del proyecto" loading="lazy" decoding="async"><figcaption>Observa el impacto de cada decisión en los resultados del proyecto.</figcaption></figure></div></section>
    <section class="saas-section saas-certificate digital-photo-section" id="certificacion">'''+section_photo(data,'certificate','../../',False)+'''<div class="section-container saas-result-grid"><div class="digital-heading"><h2>Tu desempeño también se certifica</h2><p>Al completar la experiencia recibirás un certificado digital de MALBA PMC que puedes compartir en tu perfil profesional.</p>'''+b.checklist(['Constancia de tu participación en la experiencia','Resultados y aprendizajes de la simulación','Un recurso para compartir tu desarrollo profesional'])+'''</div>'''+certificate_image+'''</div></section>
    <section class="saas-section saas-plans digital-photo-section" id="planes">'''+section_photo(data,'plans','../../',False)+'''<div class="section-container"><div class="digital-heading centered"><h2>Elige tu plan MALBA Simulator</h2><p>Entrena por tu cuenta o lleva la experiencia a tu institución y equipo.</p></div><div class="saas-plan-grid">'''
    for plan in data['plans']:
        main+=f'''<article class="saas-plan-card{' featured' if plan['id']=='universitario' else ''}"><h3>{b.esc(plan['title'])}</h3><p>{b.esc(plan['description'])}</p><div class="saas-plan-price"><strong>{b.esc(plan['license'])}</strong><span>Tarifa por confirmar</span><small>Una licencia · un correo</small></div>{b.checklist(plan['features'])}<button type="button" class="button button-purple" data-saas-plan="{b.esc(plan['id'])}">{'Solicitar acceso' if plan['id']=='individual' else 'Seleccionar licencias'} <span aria-hidden="true">→</span></button></article>'''
    main+='''</div><p class="saas-plan-note">Estamos preparando las modalidades de acceso SaaS. Solicita información sobre la disponibilidad y las tarifas de tu plan.</p></div></section><section class="saas-final digital-photo-section">'''+section_photo(data,'final','../../',False)+'''<div class="section-container"><h2>¿Listo para poner tus decisiones a prueba?</h2><p>Lleva la gestión de proyectos de la teoría a la práctica con MALBA Simulator.</p><div class="saas-actions"><a class="button button-white" href="#planes">Elegir un plan →</a><a class="button button-outline" href="'''+b.esc(demo)+'''" target="_blank" rel="noopener noreferrer">Solicitar demo ↗</a></div></div></section>'''
    main+='''<dialog id="saas-plan-dialog" class="saas-plan-dialog"><button type="button" class="saas-dialog-close" aria-label="Cerrar">×</button><h2 id="saas-dialog-title">Configura tu acceso</h2><p>Selecciona cuántas personas participarán. Cada licencia se asocia a un correo.</p><form id="saas-plan-form"><label>Cantidad de licencias<input type="number" name="quantity" min="1" max="1000" step="1" value="1" required></label><div class="saas-selection-summary"><strong data-plan-name></strong><span data-plan-quantity></span><small>Tarifa y disponibilidad por confirmar</small></div><button class="button button-purple" type="submit">Consultar acceso por WhatsApp ↗</button><p class="saas-dialog-note">Esta solicitud no realiza un cobro ni activa licencias. Te confirmaremos las condiciones de acceso.</p></form></dialog>'''
    return main

def risk(data,p):
    url=contact(data,'Hola, deseo información sobre MALBA Risk y su disponibilidad.')
    return f'''<section class="digital-risk-hero digital-photo-section">{section_photo(data,"riskHero","../../",True)}<div class="section-container saas-hero-grid"><div><h1>{b.esc(p['title'])}</h1><p>{b.esc(p['description'])}</p><a class="button button-white" href="{b.esc(url)}" target="_blank" rel="noopener noreferrer">Consultar disponibilidad ↗</a></div><img src="../../{b.esc(p['image'])}" width="960" height="540" alt="Profesionales analizando riesgos de un proyecto" class="risk-hero-image"></div></section><section class="saas-section risk-content-section digital-photo-section">{section_photo(data,"riskContent","../../")}<div class="section-container"><div class="digital-heading"><h2>Gestiona la incertidumbre con una visión estructurada</h2><p>Una solución para acompañar la identificación, valoración y seguimiento de riesgos en tus proyectos.</p></div><div class="saas-steps risk-capabilities">{''.join(f'<article><span aria-hidden="true">{i:02}</span><h3>{b.esc(text)}</h3></article>' for i,text in enumerate(p['features'],1))}</div><div class="risk-availability"><h2>Próximamente</h2><p>Consulta al equipo MALBA para conocer el alcance y las próximas modalidades de acceso.</p><a href="{b.esc(url)}" class="button button-purple" target="_blank" rel="noopener noreferrer">Quiero más información ↗</a></div></div></section>'''
