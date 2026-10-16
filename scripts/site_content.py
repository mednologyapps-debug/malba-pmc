"""Versioned company/consulting content; upgrades never copy private edits to public."""
from copy import deepcopy
import json
import re
import build_academia as b

FILES={'about':'nosotros.json','consulting':'consultoria.json'}

def defaults(area):
    return json.loads((b.ROOT/'content'/FILES[area]).read_text(encoding='utf-8'))

def fill(template,value):
    if isinstance(template,dict) and isinstance(value,dict):
        return {**deepcopy(template),**{k:fill(template[k],v) if k in template else deepcopy(v) for k,v in value.items()}}
    if isinstance(template,list) and isinstance(value,list) and template:
        return [fill(next((x for x in template if isinstance(x,dict) and isinstance(v,dict) and x.get('id')==v.get('id')),template[0]),v) for v in value]
    return deepcopy(value)

def upgrade(data):
    result=deepcopy(data)
    for area in FILES:result[area]=fill(defaults(area),result.get(area,defaults(area)))
    return result

def validate(data):
    def shape(template,value,path):
        if isinstance(template,dict):
            if not isinstance(value,dict):raise ValueError('Sección inválida: '+path)
            for k,v in template.items():
                if k not in value:raise ValueError('Completa el campo '+path+'.'+k)
                shape(v,value[k],path+'.'+k)
        elif isinstance(template,list):
            if not isinstance(value,list) or not 1<=len(value)<=30:raise ValueError('Conserva entre 1 y 30 elementos en '+path)
            for v in value:shape(template[0],v,path)
        elif not isinstance(value,str) or (not value.strip() and not path.endswith('.imageAlt')):
            raise ValueError('Completa el texto '+path)
    for area in FILES:shape(defaults(area),data.get(area),area)
    expected={x['id']:x['slug'] for x in defaults('consulting')['services']}
    actual=data['consulting']['services']
    if len(actual)!=2 or {x['id']:x['slug'] for x in actual}!=expected:
        raise ValueError('Conserva las dos especialidades y sus direcciones publicadas.')
    destinations=data['about']['destinations']
    if len(destinations)!=3 or {x['id'] for x in destinations}!={'consulting','academy','digital'}:
        raise ValueError('Conserva los accesos a Consultoría, Academia y Soluciones digitales.')
    if not re.fullmatch(r'https://wa\.me/[0-9]{7,15}',data['consulting']['contactUrl']):
        raise ValueError('El contacto de consultoría debe ser https://wa.me/ seguido del número con código de país.')
