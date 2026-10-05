#!/usr/bin/env python3
"""Render Academia and program pages from content/academia.json (Python stdlib only)."""
from datetime import datetime, timezone
from pathlib import Path
from html import escape
from urllib.parse import urlparse
import json, re, math

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://malba-pmc.com/'

def esc(value):
    return escape(str(value if value is not None else ''), quote=True)

def safe_url(value):
    value = str(value)
    parsed = urlparse(value)
    if any(ord(c) < 32 for c in value) or value.startswith('//'):
        raise ValueError('Unsafe URL')
    if parsed.scheme and parsed.scheme != 'https':
        raise ValueError('Only HTTPS external URLs are supported')
    if not parsed.scheme and (value.startswith('/') or '..' in value.split('/')):
        raise ValueError('Local URLs must be relative to the site root')
    return value

def local(value, prefix):
    value = safe_url(value)
    return value if value.startswith('https://') or value.startswith('#') else prefix + value

def picture(image, small, alt, prefix, cls='', eager=False):
    return f'''<picture class="{esc(cls)}"><source media="(max-width: 760px)" srcset="{esc(local(small, prefix))}"><img src="{esc(local(image, prefix))}" alt="{esc(alt)}" width="1672" height="941" {'fetchpriority="high"' if eager else 'loading="lazy"'} decoding="async"></picture>'''

def paras(lines):
    return ''.join(f'<p>{esc(x)}</p>' for x in lines if x)

def checklist(items):
    return '<ul class="course-checklist">' + ''.join(f'<li>{esc(x)}</li>' for x in items) + '</ul>' if items else ''

def section_head(data):
    return f'<div class="course-heading"><h2>{esc(data["title"])}</h2><p>{esc(data.get("description", ""))}</p></div>'

def card_grid(items, label):
    return f'''<div class="course-card-track" tabindex="0" aria-label="{esc(label)}">''' + ''.join(f'<article class="course-small-card"><span class="course-number" aria-hidden="true">{i:02}</span><h3>{esc(x["title"])}</h3><p>{esc(x["description"])}</p></article>' for i, x in enumerate(items, 1)) + '</div><p class="course-swipe-hint">Desliza para explorar todos los contenidos <span aria-hidden="true">→</span></p>'

def outcomes_view(data):
    tabs='';panels=''
    for i,g in enumerate(data['groups']):
        ident=f'outcome-panel-{i}'
        tabs+=f'<button type="button" id="outcome-tab-{i}" role="tab" aria-controls="{ident}" aria-selected="false" data-course-panel="{i}"><span aria-hidden="true">{i+1:02}</span>{esc(g["title"])}</button>'
        panels+=f'<div id="{ident}" role="tabpanel" aria-labelledby="outcome-tab-{i}" tabindex="0" data-course-content="{i}"><h3>{esc(g["title"])}</h3><ul class="course-outcome-list">'+''.join(f'<li><strong>{esc(data["items"][j]["title"])}</strong><p>{esc(data["items"][j]["description"])}</p></li>' for j in g['items'])+'</ul></div>'
    return f'<div class="course-outcomes" data-course-switch><div class="course-outcome-tabs" role="tablist" aria-label="Competencias del programa">{tabs}</div><div class="course-outcome-panels">{panels}</div></div>'

def proof_layout(data, program):
    if not data['items']:return section_head(data)+statistics(data['stats'],program)
    shapes = {
        'expert':'<circle cx="12" cy="7" r="3"/><path d="M5 20v-3a7 7 0 0 1 14 0v3M9 16l3 3 3-3"/>',
        'practice':'<path d="M4 4h6l2 2 2-2h6v15h-6l-2 2-2-2H4zM12 6v15M7 9h2m-2 4h2m6-4h2m-2 4h2"/>',
        'simulator':'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4M7 12l3-3 3 3 4-5"/>',
        'resources':'<path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3m-4 6h8m-8 3h5"/>',
        'recordings':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 8 6 4-6 4z"/>',
        'invoice':'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 7h6m-6 4h6m-6 4h3"/>',
        'certificate':'<circle cx="12" cy="9" r="6"/><path d="m8 14-2 7 6-3 6 3-2-7m-7-5 2 2 4-4"/>'
    }
    items=''
    for item in data['items']:
        title=item['title'].lower()
        key= 'expert' if 'docente' in title else 'recordings' if 'grabad' in title else 'invoice' if 'factura' in title else 'simulator' if 'simulador' in title else 'resources' if 'plantilla' in title else 'certificate' if 'certific' in title else 'practice'
        icon=f'<span class="course-reason-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{shapes[key]}</svg></span>'
        items+=f'<li>{icon}<div><h3>{esc(item["title"])}</h3><p>{esc(item["description"])}</p></div></li>'
    return '<div class="course-proof-layout"><div class="course-proof-intro">'+section_head(data)+statistics(data['stats'],program)+'</div><ul class="course-reasons">'+items+'</ul></div>'

def statistics(items, program=None):
    items = [dict(x) for x in items]
    for x in items:
        if program and x.get('binding') == 'hours':x['value'] = f"{program['hours']} h"
        if program and x.get('binding') == 'sessions':x['value'] = str(program['sessions'])
        if program and x.get('binding') == 'start':x['value'] = start_label(program)
    return '<div class="course-stats">' + ''.join(f'<div><strong>{esc(x["value"])}</strong><span>{esc(x["label"])}</span></div>' for x in items) + '</div>' if items else ''

def price(program):
    pricing = program['pricing']
    regular, launch, end = pricing.get('regular'), pricing.get('launch'), pricing.get('launchEndsAt')
    use_launch = launch is not None and end and datetime.now(timezone.utc) < datetime.fromisoformat(end)
    amount = launch if use_launch else regular
    if amount is None:
        return '<span class="course-price-unconfirmed">Inversión por confirmar</span>'
    attrs = f'data-price-regular="{esc(regular)}" data-price-launch="{esc(launch)}" data-price-end="{esc(end)}"'
    return f'<div class="course-price" {attrs}><span data-price-label>{"Precio de lanzamiento" if use_launch else "Precio regular"}</span><strong data-price-amount>US$ {esc(amount)}</strong></div>'

def action(program, secondary=False):
    status = program['status']
    if status == 'abierto' and program.get('checkoutUrl'):
        return f'<a class="button button-purple" href="{esc(safe_url(program["checkoutUrl"]))}">Inscribirme ahora <span aria-hidden="true">→</span></a>'
    if status in ['proximamente', 'agotado']:
        return '<button class="button course-disabled" type="button" disabled>' + ('Inscripciones próximamente' if status == 'proximamente' else 'Inscripciones cerradas') + '</button>'
    return f'<a class="button button-purple" href="{esc(safe_url(program["whatsappUrl"]))}" target="_blank" rel="noopener noreferrer">Consultar próxima edición <span aria-hidden="true">↗</span></a>'

def image_badges(items):
    clock = '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>'
    calendar = '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-11 4h2m2 0h2"/>'
    return '<div class="academy-image-meta">' + ''.join(f'<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{clock if label.endswith('horas') else calendar}</svg>{esc(label)}</span>' for i,label in enumerate(items)) + '</div>'

def card(program, prefix):
    state = {'proximamente': 'Próximamente', 'consultar': 'Consultar próxima edición', 'abierto': 'Inscripciones abiertas', 'agotado': 'Inscripciones cerradas'}[program['status']]
    href = esc(local(program['slug']+'/', prefix))
    return f'''<article class="academy-program-card">
      <div class="academy-card-media"><a class="academy-card-image" href="{href}" tabindex="-1" aria-hidden="true">{picture(program['image'], program['imageSmall'], '', prefix)}</a><span class="academy-card-status">{esc(state)}</span>{image_badges([str(program['hours'])+' horas',str(program['sessions'])+' sesiones'])}</div>
      <div class="academy-card-content"><h3><a href="{href}">{esc(program['title'])}</a></h3><p>{esc(program.get('cardDescription',program['description']))}</p><div class="academy-card-bottom"><div class="academy-card-price">{price(program)}</div><a class="button button-purple academy-card-button" href="{href}">Ver programa <span class="academy-button-arrow" aria-hidden="true">→</span><span class="sr-only">: {esc(program['title'])}</span></a></div></div>
    </article>'''

def shared(template, prefix, active, programs):
    s = (ROOT/'templates'/template).read_text(encoding='utf-8').strip()
    if template == 'header.html':
        menu = '<div class="academy-menu-heading"><div><strong>Academia MALBA</strong><p>Elige tu próxima especialización.</p></div><a href="academia/">Ver todos los programas <span aria-hidden="true">→</span></a></div><div class="academy-menu-programs">'
        menu += ''.join(f'<a class="academy-menu-program" href="{esc(p["slug"]+"/")}"'+ (' aria-current="page"' if active == p['id'] else '') + f'><img src="{esc(p["imageSmall"])}" width="240" height="135" alt="" loading="lazy"><span><strong>{esc(p["title"])}</strong><small>{esc(p.get("cardDescription",p["description"]))}</small></span><span class="academy-menu-arrow" aria-hidden="true">↗</span></a>' for p in programs)
        menu += '</div><a class="academy-menu-upcoming" href="academia/proximos/">Próximas convocatorias <span aria-hidden="true">→</span></a>'

        digital=json.loads((ROOT/'content/solutions.json').read_text(encoding='utf-8'))
        digital_menu='<div class="academy-menu-heading"><div><strong>Soluciones digitales</strong><p>Entrena y mejora tus decisiones.</p></div><a href="soluciones-digitales/">Ver todas las soluciones →</a></div><div class="academy-menu-programs digital-menu-programs">'
        digital_menu+=''.join(f'<a class="academy-menu-program" href="soluciones-digitales/{esc(p["slug"])}/"><img src="{esc(p["imageSmall"])}" width="240" height="135" alt="" loading="lazy"><span><strong>{esc(p["title"])}</strong><small>{esc(p["description"])}</small></span><span class="academy-menu-arrow" aria-hidden="true">↗</span></a>' for p in digital['solutions'])+'</div>'
        is_academy=active in ['academy','upcoming']+[p['id'] for p in programs]
        s=s.replace('{{SOLUTION_LINKS}}',digital_menu).replace('{{DIGITAL_CLASS}}',' current' if active.startswith('digital') else '').replace('{{DIGITAL_ARIA}}',' aria-current="page"' if active=='digital' else '')
        s = s.replace('{{PROGRAM_LINKS}}', menu).replace('{{HOME_CLASS}}', ' current' if active == 'home' else '').replace('{{HOME_ARIA}}', ' aria-current="page"' if active == 'home' else '').replace('{{ACADEMY_CLASS}}', ' current' if is_academy else '').replace('{{ACADEMY_ARIA}}', ' aria-current="page"' if active == 'academy' else '')
    def resolve(match):
        attr, url = match.group(1), match.group(2)
        if url.startswith('#'):
            url = url if url == '#contenido' else prefix + url
        elif not url.startswith('https://'):
            url = (prefix or './') if url == './' else prefix + url
        return f'{attr}="{url}"'
    return re.sub(r'(href|src)="([^"]+)"', resolve, s)

def document(title, description, slug, prefix, main, programs, active, schema, image, image_alt=""):
    canonical = ORIGIN + slug
    data = json.dumps(schema, ensure_ascii=False).replace('<', '\\u003c')
    return f'''<!doctype html>
<html lang="es-PE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} | MALBA PMC</title><meta name="description" content="{esc(description)}">
<link rel="canonical" href="{esc(canonical)}"><meta name="robots" content="noindex, follow"><meta name="theme-color" content="#073F7C">
<meta property="og:type" content="website"><meta property="og:locale" content="es_PE"><meta property="og:site_name" content="MALBA PMC"><meta property="og:title" content="{esc(title)} | MALBA PMC"><meta property="og:description" content="{esc(description)}"><meta property="og:url" content="{esc(canonical)}"><meta property="og:image" content="{esc(ORIGIN+image)}"><meta property="og:image:alt" content="{esc(image_alt)}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{prefix}assets/favicon.png"><link rel="preload" href="{prefix}assets/fonts/outfit-semibold.ttf" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="{prefix}styles.css"><link rel="stylesheet" href="{prefix}home-sections.css"><link rel="stylesheet" href="{prefix}academia.css"><link rel="stylesheet" href="{prefix}soluciones.css">
<script src="{prefix}app.js" defer></script><script src="{prefix}academia.js" defer></script><script src="{prefix}soluciones.js" defer></script><script type="application/ld+json">{data}</script></head>
<body><a class="skip-link" href="#contenido">Ir al contenido</a>{shared('header.html',prefix,active,programs)}<main id="contenido">{main}</main>{shared('footer.html',prefix,active,programs)}{shared('dialogs.html',prefix,active,programs)}</body></html>\n'''

def breadcrumbs(title, slug):
    items = [{'@type':'ListItem', 'position':1, 'name':'Inicio', 'item':ORIGIN}, {'@type':'ListItem', 'position':2, 'name':'Academia', 'item':ORIGIN+'academia/'}]
    if slug != 'academia/':items.append({'@type':'ListItem', 'position':3, 'name':title, 'item':ORIGIN+slug})
    return {'@type':'BreadcrumbList', 'itemListElement':items}

def course_schema(program):
    return {'@type':'Course', '@id':ORIGIN+program['slug']+'/#course','name':program['title'],'description':program['description'],'url':ORIGIN+program['slug']+'/', 'inLanguage':'es-PE','image':ORIGIN+program['image'],'provider':{'@type':'Organization','name':'MALBA PMC','url':ORIGIN}}

def academy_features(items):
    shapes = ['<path d="M5 5h14v14H5zM8 9h8M8 13h5"/>', '<path d="m4 9 8-4 8 4-8 4-8-4Zm3 2v6l5 3 5-3v-6"/>', '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 7-7"/>', '<path d="M7 3h10v12H7zM10 7h4m-4 3h4M9 15v6l3-2 3 2v-6"/>']
    return '<div class="academy-feature-panel">'+''.join(f'<article><span class="academy-feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{shapes[i%4]}</svg></span><h2>{esc(x["title"])}</h2><p>{esc(x["description"])}</p></article>' for i,x in enumerate(items))+'</div>'

def theme_style(program, prefix):
    t=program['theme']
    for key in ['accent','accentDark','soft','navy']:
        if not re.fullmatch(r'#[0-9a-fA-F]{6}',t[key]):raise ValueError('Invalid theme color')
    rgb=','.join(str(int(t['navy'][i:i+2],16)) for i in [1,3,5])
    image=local(program.get('sectionImage',program['image']),prefix)
    if not re.fullmatch(r'[a-zA-Z0-9_./-]+',image):raise ValueError('Section image must be a local asset path')
    return esc(f"--course-accent:{t['accent']};--purple:{t['accentDark']};--purple-soft:{t['soft']};--blue-soft:{t['soft']};--blue:{t['navy']};--course-navy-rgb:{rgb};--course-photo:url('{image}')")

def hero(data, prefix, title=None, desc=None):
    return f'''<section class="academy-hero" aria-labelledby="academy-title">{picture(data['image'],data['imageSmall'],'',prefix,'academy-hero-background',True)}<div class="section-container academy-hero-layout"><div class="academy-hero-copy"><h1 id="academy-title">{esc(title or data['title'])}</h1><p>{esc(desc or data.get('subtitle',data.get('description')))}</p></div>{academy_features(data['features']) if data.get('features') else ''}</div></section>'''

def catalog_controls():
    return '<div class="academy-navigation"><p>Explora los programas <span aria-hidden="true">→</span></p><div><button type="button" data-program-step="-1" aria-label="Programas anteriores">←</button><button type="button" data-program-step="1" aria-label="Programas siguientes">→</button></div></div>'

def academy(data):
    a, ps, prefix = data['academy'], data['programs'], '../'
    forthcoming = data['upcoming']
    main = hero(a,prefix)
    main += f'<section class="academy-catalog section-container" id="programas" aria-labelledby="programs-title"><div class="academy-catalog-heading"><h2 id="programs-title">{esc(a["programsTitle"])}</h2><p>{esc(a["programsText"])}</p></div><div class="academy-program-grid" data-academy-track tabindex="0" aria-label="Programas de la Academia MALBA">'
    main += ''.join(card(p,prefix) for p in ps)
    main += f'''<article class="academy-program-card academy-upcoming-card"><div class="academy-card-media"><a class="academy-card-image" href="proximos/" tabindex="-1" aria-hidden="true">{picture(forthcoming['image'],forthcoming['imageSmall'],'',prefix)}</a><span class="academy-card-status">Nuevas convocatorias</span>{image_badges(['Fechas por confirmar'])}</div><div class="academy-card-content"><h3><a href="proximos/">{esc(forthcoming['title'])}</a></h3><p>{esc(forthcoming.get('cardDescription',forthcoming['description']))}</p><div class="academy-card-bottom"><div class="academy-card-price"><span>Tu próxima especialización</span></div><a class="button button-purple academy-card-button" href="proximos/">Explorar programas <span class="academy-button-arrow" aria-hidden="true">→</span></a></div></div></article></div>{catalog_controls()}</section>'''
    schema = {'@context':'https://schema.org','@graph':[{'@type':'CollectionPage','name':a['title'],'url':ORIGIN+'academia/','description':a['subtitle']}, {'@type':'ItemList','itemListElement':[{'@type':'ListItem','position':i,'item':course_schema(p)} for i,p in enumerate(ps,1)]}, breadcrumbs(a['title'],'academia/')]}
    return document(a['title'],a['subtitle'],'academia/',prefix,main,ps,'academy',schema,a['image'],a['imageAlt'])

def start_label(program):
    if not program.get('startDate'):return program.get('startLabel', 'Fechas por confirmar')
    date = datetime.fromisoformat(program['startDate'])
    months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    label = f'{date.day} de {months[date.month-1]} de {date.year}'
    return label + (' · edición anterior' if program['status'] == 'consultar' else '')

def program_page(p, programs):
    prefix = '../'
    main = f'<div class="course-page" style="{theme_style(p,prefix)}"><nav class="course-breadcrumb section-container" aria-label="Ruta de navegación"><a href="../">Inicio</a><span aria-hidden="true">/</span><a href="../academia/">Academia</a><span aria-hidden="true">/</span><span>'+esc(p['category'])+'</span></nav>'
    main += f'''<section class="course-hero" aria-labelledby="course-title">{picture(p.get('imageWide',p['image']),p['imageSmall'],'',prefix,'academy-hero-background',True)}<div class="course-hero-layout section-container"><div class="course-hero-copy"><h1 id="course-title">{esc(p['title'])}</h1><p class="course-summary">{esc(p['description'])}</p><dl class="course-facts"><div><dt>Inicio</dt><dd>{esc(start_label(p))}</dd></div><div><dt>Duración</dt><dd>{esc(p['hours'])} horas · {esc(p['sessions'])} sesiones</dd></div><div><dt>Modalidad</dt><dd>{esc(p['modality'])}</dd></div><div><dt>Horario</dt><dd>{esc(p['schedule'])}</dd></div>{'<div><dt>Edición</dt><dd>'+esc(p['edition'])+'</dd></div>' if p.get('edition') else ''}</dl><a class="button button-white" href="{esc(safe_url(p['brochureUrl']))}" target="_blank" rel="noopener noreferrer">Descargar brochure <span aria-hidden="true">↓</span></a></div><aside class="course-enrollment" aria-label="Información de inscripción"><h2>{'Próximamente' if p['status']=='proximamente' else 'Tu próxima especialización'}</h2>{price(p)}{paras([p['pricing']['note']]) if p['pricing']['regular'] is not None else ''}{action(p)}<a class="course-whatsapp" href="{esc(safe_url(p['whatsappUrl']))}" target="_blank" rel="noopener noreferrer">Consultar por WhatsApp <span aria-hidden="true">↗</span></a><p class="course-enrollment-note">{esc(p['registrationNote'])}</p></aside></div></section>'''
    main += '<nav class="course-jumpnav" aria-label="Secciones del programa"><div class="section-container"><a href="#aprendizaje">Qué aprenderás</a><a href="#contenido-del-programa">Contenido</a><a href="#docentes">Docentes</a><a href="#metodologia">Metodología</a></div></nav>'
    def section(ident,content,tint=False):
        return f'<section class="course-section course-section-photo{ " course-section-tint" if tint else ""}{ " course-section-dark" if ident in ["metodologia", "respaldo"] else ""}" id="{ident}"><div class="section-container">{content}</div></section>'
    main += section('aprendizaje',section_head(p['learning'])+card_grid(p['learning']['items'],'Contenidos de aprendizaje'))
    modules=''.join(f'<details class="course-module"><summary><span>{i:02}</span>{esc(m["title"])}</summary><div>{paras(m["paragraphs"])}'+ ('<ul>'+''.join(f'<li>{esc(t)}</li>' for t in m['topics'])+'</ul>' if m['topics'] else '')+'</div></details>' for i,m in enumerate(p['curriculum']['modules'],1))
    main += section('contenido-del-programa','<div class="course-curriculum-layout">'+'<div class="course-curriculum-intro">'+section_head(p['curriculum'])+picture(p['curriculum'].get('image',p['image']),p['imageSmall'],p['curriculum'].get('imageAlt',p['imageAlt']),prefix,'course-curriculum-image')+'</div><div class="course-modules">'+modules+'</div></div>',True)
    instructors=''
    for t in p['instructors']:
        image=f'<img src="{esc(local(t["image"],prefix))}" alt="{esc(t["name"])}" width="264" height="396" loading="lazy" decoding="async">' if t['image'] else ''
        instructors+=f'<article class="course-teacher"><div class="course-teacher-heading">{image}<div><h3>{esc(t["name"])}</h3><p>{esc(t["credentials"])}</p></div></div><p>{esc(t["description"])}</p>{checklist(t["points"])}</article>'
    main+=section('docentes','<div class="course-split"><div>'+section_head(p['specialization'])+checklist(p['specialization']['points'])+'</div><div class="course-teachers"><h2>Docentes</h2>'+instructors+'</div></div>')
    main+=section('metodologia',section_head(p['methodology'])+card_grid(p['methodology']['items'],'Etapas de la metodología'),True)
    a=p['applied']; visual=''
    if a['image']:visual=f'<img class="course-application-image" src="{esc(local(a["image"],prefix))}" width="1100" height="508" alt="Simulador MALBA de proyectos de transmisión eléctrica" loading="lazy" decoding="async">'+statistics(a['stats'])
    if a['tools']:visual='<div class="course-tools"><h3>'+esc(a.get('toolsTitle','Herramientas del programa'))+'</h3>'+''.join(f'<div><strong>{esc(t["title"])}</strong><p>{esc(t["description"])}</p></div>' for t in a['tools'])+'</div>'
    if a['lab']:visual=f'<div class="course-lab-feature"><h3>{esc(a["lab"]["title"])}</h3><p>{esc(a["lab"]["description"])}</p><div class="course-lab-diagram" aria-hidden="true"><span>Estrategia</span><span>PMO</span><span>Valor</span></div></div>'
    sectors='<div class="course-sector-list">'+''.join(f'<span>{esc(t)}</span>' for t in a['sectors'])+'</div>' if a['sectors'] else ''
    main+=section('aplicacion','<div class="course-split"><div>'+section_head(a)+checklist(a['points'])+sectors+'</div><div>'+visual+'</div></div>')
    main+=section('resultados',section_head(p['outcomes'])+outcomes_view(p['outcomes']),True)
    c=p['certificate']
    if c:
        main+=section('certificacion',f'<div class="course-split"><img class="course-certificate" src="{esc(local(c["image"],prefix))}" width="1100" height="778" alt="{esc(c["imageAlt"])}" loading="lazy" decoding="async"><div>'+section_head(c)+checklist(c['points'])+ (f'<p>{esc(c["note"])}</p>' if c['note'] else '')+'</div></div>')
    if p['lab']:main+=section('laboratorio',section_head(p['lab'])+card_grid(p['lab']['items'],'Entregables del laboratorio'))
    proof=p['proof'];main+=section('respaldo',proof_layout(proof,p),True)
    main+=f'<section class="course-final"><div class="section-container"><div><h2>{esc(p["final"]["title"])}</h2><p>{esc(p["final"]["description"])}</p></div><div>{price(p)}{action(p)}</div></div></section>'
    main+='</div>'
    schema={'@context':'https://schema.org','@graph':[course_schema(p),breadcrumbs(p['title'],p['slug']+'/')]}
    return document(p['title'],p['description'],p['slug']+'/',prefix,main,programs,p['id'],schema,p.get('imageWide',p['image']),p['imageAlt'])

def upcoming(data):
    u,ps,prefix=data['upcoming'],data['programs'],'../../'
    main=hero(u,prefix)+f'<section class="academy-intro section-container"><div class="academy-intro-panel"><h2>{esc(u["introTitle"])}</h2><p>{esc(u["introText"])}</p></div></section><section class="academy-catalog section-container"><div class="academy-program-grid" data-academy-track tabindex="0" aria-label="Programas de la Academia MALBA">'+''.join(card(p,prefix) for p in ps if p['status']=='proximamente')+'</div>'+catalog_controls()
    main+=f'<div class="academy-next-actions"><a class="button button-purple" href="{esc(safe_url(u["contactUrl"]))}" target="_blank" rel="noopener noreferrer">Consultar convocatorias <span aria-hidden="true">↗</span></a><a class="text-link" href="../">Ver toda la academia <span aria-hidden="true">→</span></a></div></section>'
    schema={'@context':'https://schema.org','@graph':[{'@type':'CollectionPage','name':u['title'],'url':ORIGIN+'academia/proximos/','description':u['description']},breadcrumbs(u['title'],'academia/proximos/')]}
    return document(u['title'],u['description'],'academia/proximos/',prefix,main,ps,'upcoming',schema,u['image'],u['title'])

def validate(data):
    if data['version'] != 1:raise ValueError('Unsupported content version')
    seen=set()
    for p in data['programs']:
        theme_style(p,'../')
        groups=p['outcomes']['groups']
        indices=[j for g in groups for j in g['items']]
        if sorted(indices)!=list(range(len(p['outcomes']['items']))):raise ValueError('Outcome groups must contain each competency exactly once')
        if not re.fullmatch(r'[a-z0-9-]+',p['slug']) or p['slug'] in seen:raise ValueError('Invalid/duplicate slug')
        seen.add(p['slug'])
        if p['status'] not in ['abierto','proximamente','consultar','agotado']:raise ValueError('Invalid registration status')
        if p['pricing']['currency'] != 'USD':raise ValueError('Only USD currently supported')
        for amount in ['regular','launch']:
            x=p['pricing'].get(amount)
            if x is not None and (not isinstance(x,(int,float)) or not math.isfinite(x) or x<0):raise ValueError('Invalid price')
        for key in ['brochureUrl','whatsappUrl','checkoutUrl']:
            if p.get(key):safe_url(p[key])
        if p.get('startDate'):
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',p['startDate']):raise ValueError('Start date must use YYYY-MM-DD')
            datetime.fromisoformat(p['startDate'])
        if p['pricing'].get('launchEndsAt'):
            end=datetime.fromisoformat(p['pricing']['launchEndsAt'])
            if end.tzinfo is None:raise ValueError('Price deadline must include timezone')
        for group in ['learning','methodology','outcomes']:
            if not p[group]['items'] or any(not x['title'] for x in p[group]['items']):raise ValueError('Empty content cards')

def render_outputs(data, home=None):
    """Pure publication snapshot, reused by CLI and authenticated CMS."""
    validate(data)
    outputs={'academia/index.html':academy(data),'academia/proximos/index.html':upcoming(data)}
    outputs.update({p['slug']+'/index.html':program_page(p,data['programs']) for p in data['programs']})
    home = home if home is not None else (ROOT/'index.html').read_text(encoding='utf-8')
    home=re.sub(r'<header class="site-header">.*?</header>',lambda _:shared('header.html','','home',data['programs']),home,flags=re.S)
    home=re.sub(r'<footer class="site-footer".*?</footer>',lambda _:shared('footer.html','','home',data['programs']),home,flags=re.S)
    from build_solutions import render_solutions
    outputs.update(render_solutions(data['programs']))
    outputs['index.html']=re.sub(r'</header>\s+<main', '</header>\n    <main', home)
    urls=['']+[name.removesuffix('index.html') for name in outputs if name!='index.html' and name.endswith('index.html')]
    outputs['sitemap.xml']='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join(f'  <url><loc>{ORIGIN}{s}</loc></url>\n' for s in urls)+'</urlset>\n'
    return outputs

def build():
    data=json.loads((ROOT/'content/academia.json').read_text(encoding='utf-8'))
    outputs=render_outputs(data)
    for name,body in outputs.items():
        dest=ROOT/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(body,encoding='utf-8')
    print(f'Built {len(outputs)-2} pages; shared homepage navigation and sitemap updated.')

if __name__=='__main__':build()
