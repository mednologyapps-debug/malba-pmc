"""Consulting catalog and two service pages, with the shared MALBA navigation."""
import json
import build_academia as b


def defaults():
    return json.loads((b.ROOT/'content/consultoria.json').read_text(encoding='utf-8'))


def menu(active,data=None):
    data=data if data is not None else defaults()
    return '<div class="academy-menu-heading"><div><strong>Consultoría MALBA</strong><p>Experiencia aplicada a los desafíos de tu proyecto.</p></div><a href="consultoria/">Explorar consultoría →</a></div><div class="academy-menu-programs digital-menu-programs">'+''.join(f'<a class="academy-menu-program" href="{b.esc(p["slug"])}/"'+(' aria-current="page"' if active=='consulting-'+p['id'] else '')+f'><img src="{b.esc(p["imageSmall"])}" width="240" height="135" alt="" loading="lazy"><span><strong>{b.esc(p["name"])}</strong><small>{b.esc(p["description"])}</small></span><span class="academy-menu-arrow" aria-hidden="true">↗</span></a>' for p in data['services'])+'</div>'


def photo(image,small,prefix,cls='',eager=False):
    return b.picture(image,small,'',prefix,'consult-background '+cls,eager).replace('<picture','<picture aria-hidden="true"',1)


def points(items):
    return '<ul class="consult-checklist">'+''.join('<li>'+b.esc(x)+'</li>' for x in items)+'</ul>'


def contact(data,chosen=None):
    cfg=data['contact']
    options=''.join(f'<option value="{b.esc(p["name"])}"'+(' selected' if chosen and p['id']==chosen['id'] else '')+'>'+b.esc(p['name'])+'</option>' for p in data['services'])
    return f'''<section class="consult-contact consult-photo-section" id="consulta" aria-labelledby="consult-contact-title">{photo(cfg['image'],cfg['imageSmall'],'../')}<div class="section-container consult-contact-grid"><div><h2 id="consult-contact-title">{b.esc(cfg['title'])}</h2><p>{b.esc(cfg['description'])}</p><ol class="consult-contact-steps">{''.join(f'<li><span>{i:02}</span> {b.esc(text)}</li>' for i,text in enumerate(cfg['steps'],1))}</ol><a class="consult-direct-link" href="{b.esc(data['contactUrl'])}" target="_blank" rel="noopener noreferrer">Prefiero escribir directamente por WhatsApp ↗</a></div><form method="post" class="consult-form" data-consult-contact data-contact-url="{b.esc(data['contactUrl'])}"><h3>{b.esc(cfg['formTitle'])}</h3><div class="consult-form-row"><label>Nombre completo<input name="name" autocomplete="name" required maxlength="120" placeholder="Tu nombre y apellidos"></label><label>Empresa <small>(opcional)</small><input name="company" autocomplete="organization" maxlength="150" placeholder="Nombre de tu organización"></label></div><label>Correo electrónico<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="nombre@empresa.com"></label><label>¿En qué podemos apoyarte?<select name="service">{options}</select></label><label>Cuéntanos sobre tu proyecto<textarea name="context" rows="3" required maxlength="1500" placeholder="Etapa del proyecto, desafío principal y apoyo que necesitas."></textarea></label><button class="button button-purple" type="submit" disabled>Continuar por WhatsApp <span aria-hidden="true">↗</span></button><p class="consult-form-note">Se abrirá WhatsApp con tu consulta. Tú decides cuándo enviarla.</p><noscript><p>Para solicitar información, utiliza el enlace directo de WhatsApp de esta sección.</p></noscript></form></div></section>'''


def document(title,description,slug,main,programs,active,image,alt,service=None):
    schema={'@context':'https://schema.org','@graph':[{'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Inicio','item':b.ORIGIN},{'@type':'ListItem','position':2,'name':'Consultoría','item':b.ORIGIN+'consultoria/'}]+([{'@type':'ListItem','position':3,'name':service['name'],'item':b.ORIGIN+slug}] if service else [])}]}
    if service:schema['@graph'].append({'@type':'Service','name':title,'description':description,'serviceType':service['name'],'url':b.ORIGIN+slug,'provider':{'@type':'Organization','name':'MALBA PMC','url':b.ORIGIN}})
    else:schema['@graph'].append({'@type':'CollectionPage','name':'Consultoría MALBA PMC','description':description,'url':b.ORIGIN+slug})
    result=b.document(title,description,slug,'../','<div class="consult-page">'+main+'</div>',programs,active,schema,image,alt)
    return result.replace('</head>','<link rel="stylesheet" href="../consultoria.css"><script src="../consultoria.js" defer></script></head>')


def render_consulting(programs,data=None):
    data=data if data is not None else defaults();outputs={}
    hero=f'''<section class="consult-hero consult-photo-section">{photo(data['heroMedia']['image'],data['heroMedia']['imageSmall'],'../',eager=True)}<div class="section-container consult-catalog-hero"><div><h1>{b.esc(data['title'])}</h1><p>{b.esc(data['description'])}</p><div class="consult-actions"><a class="button button-white" href="#especialidades">Explorar especialidades <span aria-hidden="true">↓</span></a><a class="consult-secondary" href="#consulta">Conversemos →</a></div></div><aside class="consult-hero-note"><span class="consult-line-symbol" aria-hidden="true">↗</span><h2>{b.esc(data['heroNoteTitle'])}</h2><p>{b.esc(data['heroNoteText'])}</p><div>{''.join('<span>'+b.esc(x)+'</span>' for x in data['heroTags'])}</div></aside></div></section>'''
    cards=''.join(f'''<article class="consult-specialty-card"><a class="consult-specialty-image" href="../{b.esc(p['slug'])}/" tabindex="-1" aria-hidden="true">{b.picture(p['image'],p['imageSmall'],'','../')}</a><div class="consult-specialty-copy"><h3><a href="../{b.esc(p['slug'])}/">{b.esc(p['name'])}</a></h3><p>{b.esc(p['description'])}</p>{points(p['highlights'])}<a class="button button-purple" href="../{b.esc(p['slug'])}/">Conocer la consultoría <span aria-hidden="true">→</span><span class="sr-only">: {b.esc(p['name'])}</span></a></div></article>''' for p in data['services'])
    main=hero+f'''<section class="consult-specialties section-container" id="especialidades" aria-labelledby="specialties-title"><div class="consult-heading"><h2 id="specialties-title">{b.esc(data['catalogTitle'])}</h2><p>{b.esc(data['catalogText'])}</p></div><div class="consult-specialty-grid">{cards}</div></section>'''+contact(data)
    outputs['consultoria/index.html']=document('Consultoría',data['description'],'consultoria/',main,programs,'consulting',data['heroMedia']['image'],data['heroMedia']['imageAlt'])
    for p in data['services']:
        other=next(x for x in data['services'] if x['id']!=p['id'])
        breadcrumb=f'<nav class="consult-breadcrumb section-container" aria-label="Ruta de navegación"><a href="../">Inicio</a><span aria-hidden="true">/</span><a href="../consultoria/">Consultoría</a><span aria-hidden="true">/</span><span>{b.esc(p["name"])}</span></nav>'
        hero=f'''<section class="consult-hero consult-photo-section consult-detail-hero">{photo(p['image'],p['imageSmall'],'../',eager=True)}{breadcrumb}<div class="section-container consult-detail-grid"><div><h1>{b.esc(p['title'].removeprefix('Consultoría en ').capitalize())}</h1><p>{b.esc(p['description'])}</p><div class="consult-actions"><a class="button button-white" href="#consulta">Solicitar consultoría <span aria-hidden="true">→</span></a><a class="consult-secondary" href="#servicios">Ver cómo te apoyamos ↓</a></div><ul class="consult-hero-tags">{''.join('<li>'+b.esc(x)+'</li>' for x in p['highlights'])}</ul></div><aside class="consult-hero-note"><details class="consult-when" open><summary><h2>{b.esc(p['whenTitle'])}</h2></summary>{points(p['when'])}</details></aside></div></section>'''
        details=''.join(f'''<details class="consult-service"{' open' if i==0 else ''}><summary><span class="consult-service-index" aria-hidden="true">{i+1:02}</span><div><h3>{b.esc(s['title'])}</h3><p>{b.esc(s['summary'])}</p></div><span class="consult-expand" aria-hidden="true">+</span></summary><div class="consult-service-body"><p>{b.esc(s['description'])}</p><div class="consult-deliverable"><strong>Enfoque del trabajo</strong><p>{b.esc(s['deliverable'])}</p></div><a href="#consulta" class="consult-service-request" data-consult-topic="{b.esc(s['title'])}">Consultar sobre este servicio <span aria-hidden="true">→</span></a></div></details>''' for i,s in enumerate(p['services']))
        intro=f'''<section class="consult-intro-section"><div class="section-container"><div class="consult-intro-feature">{b.picture(p['introMedia']['image'],p['introMedia']['imageSmall'],p['introMedia']['imageAlt'],'../','consult-intro-media')}<div class="consult-intro-content"><h2>{b.esc(p['introTitle'])}</h2><p>{b.esc(p['intro'])}</p><a href="#servicios">Explorar cómo te apoyamos <span aria-hidden="true">↓</span></a></div></div></div></section><section class="consult-services-section consult-photo-section" id="servicios" aria-labelledby="consult-services-title">{photo(p['servicesMedia']['image'],p['servicesMedia']['imageSmall'],'../')}<div class="section-container consult-services-layout"><div class="consult-services-intro"><h2 id="consult-services-title">{b.esc(p['servicesTitle'])}</h2><p>{b.esc(p['servicesText'])}</p>{b.picture(p['servicesImage']['image'],p['servicesImage']['imageSmall'],p['servicesImage']['imageAlt'],'../','consult-services-image')}</div><div class="consult-service-list">{details}</div></div></section>'''
        benefits=f'''<section class="consult-outcomes section-container"><div class="consult-outcomes-copy"><h2>{b.esc(p['outcomeTitle'])}</h2><p>{b.esc(p['outcomeDescription'])}</p></div>{points(p['benefits'])}</section>'''
        related=f'''<section class="consult-related section-container"><div><h2>Complementa la gestión de tu proyecto.</h2><p>Conoce también nuestra consultoría en {b.esc(other['name'].lower())}.</p></div><a class="button button-purple" href="../{b.esc(other['slug'])}/">Explorar {b.esc(other['name'].lower())} →</a></section>'''
        outputs[p['slug']+'/index.html']=document(p['title'],p['description'],p['slug']+'/',hero+intro+benefits+related+contact(data,p),programs,'consulting-'+p['id'],p['image'],p['imageAlt'],p)
    return outputs
