"""Private initial LMS: separate student identities, enrolments and immutable certificates."""
import base64,hashlib,hmac,io,json,mimetypes,re,secrets,time,uuid,threading,os,zipfile,xml.etree.ElementTree as ET,smtplib,ssl
from email.message import EmailMessage
from html import escape
from copy import deepcopy
from datetime import datetime,timezone,timedelta
LIMA=timezone(timedelta(hours=-5))
from pathlib import Path
from urllib.parse import urlsplit,parse_qs,quote

MAX_UPLOAD=100*1024*1024
COOKIE='malba_student'
PDF_RENDER_LOCK=threading.Lock()

def initialize(db):
    db.executescript('''
    CREATE TABLE IF NOT EXISTS lms_students(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,force_password INTEGER NOT NULL DEFAULT 1,created REAL NOT NULL,deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS lms_sessions(id TEXT PRIMARY KEY,student_id TEXT NOT NULL,csrf TEXT NOT NULL,created REAL NOT NULL,touched REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS lms_courses(id TEXT PRIMARY KEY,draft TEXT NOT NULL,published TEXT,revision INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,updated REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS lms_enrollments(student_id TEXT NOT NULL,course_id TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,expires TEXT NOT NULL DEFAULT '',last_lesson TEXT NOT NULL DEFAULT '',created REAL NOT NULL,PRIMARY KEY(student_id,course_id));
    CREATE TABLE IF NOT EXISTS lms_progress(student_id TEXT NOT NULL,course_id TEXT NOT NULL,lesson_id TEXT NOT NULL,completed REAL NOT NULL,PRIMARY KEY(student_id,course_id,lesson_id));
    CREATE TABLE IF NOT EXISTS lms_files(id TEXT PRIMARY KEY,course_id TEXT NOT NULL,name TEXT NOT NULL,ext TEXT NOT NULL,size INTEGER NOT NULL,created REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS lms_certificates(id TEXT PRIMARY KEY,student_id TEXT NOT NULL,course_id TEXT NOT NULL,snapshot TEXT NOT NULL,issued REAL NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,UNIQUE(student_id,course_id));
    CREATE TABLE IF NOT EXISTS lms_quiz_attempts(id TEXT PRIMARY KEY,student_id TEXT NOT NULL,course_id TEXT NOT NULL,lesson_id TEXT NOT NULL,answers TEXT NOT NULL,score INTEGER NOT NULL,passed INTEGER NOT NULL,created REAL NOT NULL);
    CREATE INDEX IF NOT EXISTS lms_quiz_student ON lms_quiz_attempts(student_id,course_id,lesson_id);
    CREATE INDEX IF NOT EXISTS lms_enrollment_course ON lms_enrollments(course_id);
    ''')
    # Migrate installations created before the student trash was introduced.
    columns={r[1] for r in db.execute('PRAGMA table_info(lms_students)')}
    if 'deleted' not in columns:db.execute('ALTER TABLE lms_students ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0')

def text(v,limit=500,required=False):
    if not isinstance(v,str) or len(v)>limit or any(ord(c)<32 and c not in '\n\t\r' for c in v):raise ValueError('Revisa los textos: hay un campo inválido o demasiado largo.')
    if required and not v.strip():raise ValueError('Completa los campos obligatorios.')
    return v.strip()

def ident(v):
    if not isinstance(v,str) or not re.fullmatch('[a-zA-Z0-9_-]{8,80}',v):raise ValueError('Identificador inválido.')
    return v

def url(v):
    value=text(v,2000)
    if value and (urlsplit(value).scheme!='https' or not urlsplit(value).hostname or urlsplit(value).username or '\\' in value):raise ValueError('Usa un enlace HTTPS válido.')
    return value

def lessons(course):return [l for m in course['modules'] for l in m['lessons']]

def validate_course(c,db,publish=False):
    if not isinstance(c,dict):raise ValueError('Curso inválido.')
    ident(c['id']);text(c['title'],180,True);text(c.get('description',''),5000);text(c.get('introduction',''),10000);text(c.get('instructor',''),180);text(c.get('sourceProgramId',''),100)
    cover=text(c.get('image',''),2000)
    if cover and not (cover.startswith('assets/') and '..' not in cover and '\\' not in cover):url(cover)
    hours=c.get('hours',0)
    if isinstance(hours,bool) or not isinstance(hours,(int,float)) or not 0<=hours<=5000:raise ValueError('Horas del curso inválidas.')
    cert=c.get('certificate')
    if not isinstance(cert,dict) or not isinstance(cert.get('enabled'),bool):raise ValueError('Configura el certificado del curso.')
    for key,limit in [('title',120),('statement',500),('issuer',140),('role',180)]:text(cert.get(key,''),limit,publish and cert['enabled'])
    signature=text(cert.get('signatureImage',''),2000)
    if signature and (not signature.startswith('assets/') or '..' in signature or '\\' in signature):raise ValueError('Sube una firma como imagen local desde el editor del certificado.')
    if signature:
        import build_academia as renderer
        if Path(signature).suffix.lower() not in ['.png','.jpg','.jpeg','.webp'] or not (renderer.ROOT/signature).is_file():raise ValueError('La imagen de firma no existe o no es PNG, JPG o WebP.')
    if publish and cert['enabled'] and hours<=0:raise ValueError('Completa las horas académicas del curso para emitir certificados.')
    modules=c.get('modules');seen=set()
    if not isinstance(modules,list) or len(modules)>50:raise ValueError('Máximo 50 módulos por curso.')
    for module in modules:
        ident(module['id']);text(module['title'],180,True)
        if module['id'] in seen:raise ValueError('Hay identificadores repetidos.')
        seen.add(module['id'])
        if not isinstance(module.get('lessons'),list) or len(module['lessons'])>100:raise ValueError('Máximo 100 lecciones por módulo.')
        for l in module['lessons']:
            ident(l['id']);text(l['title'],180,True)
            if l['id'] in seen:raise ValueError('Hay identificadores repetidos.')
            seen.add(l['id']);text(l.get('body',''),30000);url(l.get('videoUrl',''));url(l.get('meetingUrl',''))
            if l.get('type') not in ['text','video','live','quiz'] or not isinstance(l.get('required'),bool):raise ValueError('Tipo de lección inválido.')
            if not isinstance(l.get('minutes'),int) or not 0<=l['minutes']<=3000:raise ValueError('Duración de la lección inválida.')
            if l['type']=='quiz':
                quiz=l.get('quiz',{});questions=quiz.get('questions')
                if not isinstance(quiz.get('passPercent'),int) or isinstance(quiz['passPercent'],bool) or not 1<=quiz['passPercent']<=100:raise ValueError('La nota mínima del test debe estar entre 1 y 100.')
                if not isinstance(questions,list) or not 1<=len(questions)<=20:raise ValueError('El test debe contener entre 1 y 20 preguntas.')
                for q in questions:
                    text(q.get('question'),500,True);text(q.get('explanation',''),1000)
                    if not isinstance(q.get('options'),list) or not 2<=len(q['options'])<=6:raise ValueError('Cada pregunta necesita entre 2 y 6 opciones.')
                    for option in q['options']:text(option,400,True)
                    if isinstance(q.get('correct'),bool) or not isinstance(q.get('correct'),int) or not 0<=q['correct']<len(q['options']):raise ValueError('Selecciona una respuesta correcta por pregunta.')
            resources=l.get('resources')
            if not isinstance(resources,list) or len(resources)>30:raise ValueError('Máximo 30 materiales por lección.')
            for resource in resources:
                text(resource['name'],200,True)
                if resource.get('url'):url(resource['url'])
                elif not resource.get('fileId'):raise ValueError('Completa el enlace o archivo del material.')
            ids=[x['fileId'] for x in resources if x.get('fileId')]+([l['videoFileId']] if l.get('videoFileId') else [])
            for fid in ids:
                f=db.execute('SELECT * FROM lms_files WHERE id=? AND course_id=?',(ident(fid),c['id'])).fetchone()
                if not f:raise ValueError('El archivo no pertenece a este curso.')
                if fid==l.get('videoFileId') and f['ext']!='.mp4':raise ValueError('El vídeo debe ser MP4.')
            if publish:
                if l['type']=='video' and not (l.get('videoUrl') or l.get('videoFileId')):raise ValueError('Añade el video de la lección: '+l['title'])
                if l['type']=='live' and not l.get('meetingUrl'):raise ValueError('Añade el enlace de la sesión: '+l['title'])
                if l['type']=='text' and not (l.get('body','').strip() or resources):raise ValueError('Añade el contenido de la lección: '+l['title'])
    if publish and not any(l['required'] for l in lessons(c)):raise ValueError('Añade al menos una lección obligatoria antes de publicar.')

def student_session(h,cms,csrf=False,allow_password=False):
    cookies={p.strip().split('=',1)[0]:p.strip().split('=',1)[1] for p in h.headers.get('Cookie','').split(';') if '=' in p}
    sid=cookies.get(COOKIE,'')
    if not re.fullmatch('[a-zA-Z0-9_-]{40,100}',sid):return None
    now=time.time();key=hashlib.sha256(sid.encode()).hexdigest()
    with cms.connect() as db:
        s=db.execute('SELECT s.*,u.name,u.email,u.active,u.deleted,u.force_password FROM lms_sessions s JOIN lms_students u ON u.id=s.student_id WHERE s.id=?',(key,)).fetchone()
        if not s or not s['active'] or s['deleted'] or now-s['created']>cms.SESSION_MAX or now-s['touched']>cms.SESSION_IDLE:
            db.execute('DELETE FROM lms_sessions WHERE id=?',(key,));return None
        if csrf and not hmac.compare_digest(h.headers.get('X-CSRF-Token',''),s['csrf']):raise PermissionError('La sesión cambió. Vuelve a ingresar.')
        if s['force_password'] and not allow_password:raise PermissionError('Cambia tu contraseña temporal para ingresar al aula.')
        db.execute('UPDATE lms_sessions SET touched=? WHERE id=?',(now,key))
        return dict(s)

def accessible(db,student,course_id):
    row=db.execute('SELECT c.published,c.active,e.active enrolled,e.expires FROM lms_courses c JOIN lms_enrollments e ON e.course_id=c.id WHERE c.id=? AND e.student_id=?',(course_id,student)).fetchone()
    if not row or not row['active'] or not row['enrolled'] or not row['published'] or row['expires'] and row['expires']<datetime.now(LIMA).date().isoformat():raise PermissionError('No tienes una matrícula vigente para este curso.')
    return json.loads(row['published'])

def progress(db,student,course):
    done={r[0] for r in db.execute('SELECT lesson_id FROM lms_progress WHERE student_id=? AND course_id=?',(student,course['id']))}
    required=[l['id'] for l in lessons(course) if l['required']]
    completed=sum(x in done for x in required)
    return dict(done=list(done),completed=completed,total=len(required),percent=(100 if completed==len(required) else int(completed/len(required)*100)) if required else 0)

def material_metadata(course,db):
    safe=deepcopy(course)
    for lesson in lessons(safe):
        for resource in lesson['resources']:
            # Derive metadata from the stored file, even if its display name has no extension.
            for key in ['previewKind','fileName','size']:resource.pop(key,None)
            if resource.get('fileId'):
                file=db.execute('SELECT ext,name,size FROM lms_files WHERE id=? AND course_id=?',(resource['fileId'],course['id'])).fetchone()
                if file:resource.update(previewKind='pdf' if file['ext']=='.pdf' else 'image' if file['ext'] in ['.png','.jpg','.jpeg','.webp'] else 'file',fileName=file['name'],size=file['size'])
    return safe

def student_view(db,student):
    courses=[]
    for e in db.execute('SELECT * FROM lms_enrollments WHERE student_id=? AND active=1',(student,)).fetchall():
        try:c=accessible(db,student,e['course_id'])
        except PermissionError:continue
        p=progress(db,student,c);cert=db.execute('SELECT id,issued FROM lms_certificates WHERE student_id=? AND course_id=? AND revoked=0',(student,c['id'])).fetchone()
        safe=material_metadata(c,db)
        for lesson in lessons(safe):
            if lesson['type']=='quiz':
                for q in lesson['quiz']['questions']:q.pop('correct',None);q.pop('explanation',None)
                latest=db.execute('SELECT score,passed,created FROM lms_quiz_attempts WHERE student_id=? AND course_id=? AND lesson_id=? ORDER BY created DESC LIMIT 1',(student,c['id'],lesson['id'])).fetchone()
                lesson['quiz']['lastAttempt']=dict(latest) if latest else None
        courses.append({'course':safe,'progress':p,'lastLesson':e['last_lesson'],'expires':e['expires'],'certificate':dict(cert) if cert else None})
    return courses

def issue_certificate(db,cms,actor,course):
    p=progress(db,actor['student_id'],course)
    if p['total'] and p['completed']==p['total'] and course['certificate']['enabled']:
        snapshot={k:course[k] for k in ['title','hours','certificate']};snapshot['name']=actor['name']
        db.execute('INSERT OR IGNORE INTO lms_certificates VALUES(?,?,?,?,?,0)',(secrets.token_hex(16),actor['student_id'],course['id'],cms.dump(snapshot),time.time()))
    cert=db.execute('SELECT id,issued FROM lms_certificates WHERE student_id=? AND course_id=? AND revoked=0',(actor['student_id'],course['id'])).fetchone()
    return {'progress':p,'certificate':dict(cert) if cert else None}

def admin_data(db):
    courses=[]
    for r in db.execute('SELECT * FROM lms_courses ORDER BY updated DESC'):
        d=dict(r);d['draft']=json.loads(d['draft']);d['published']=json.loads(d['published']) if d['published'] else None;courses.append(d)
    students=[dict(s) for s in db.execute('SELECT id,name,email,active,force_password,created,deleted FROM lms_students ORDER BY deleted,name')]
    enrollments=[]
    for e in db.execute('SELECT * FROM lms_enrollments ORDER BY created DESC').fetchall():
        item=dict(e);c=next((x for x in courses if x['id']==e['course_id']),None)
        item['progress']=progress(db,e['student_id'],c['published'] or c['draft']) if c else {'percent':0}
        cert=db.execute('SELECT id,issued,revoked FROM lms_certificates WHERE student_id=? AND course_id=?',(e['student_id'],e['course_id'])).fetchone()
        item['certificate']=dict(cert) if cert else None;enrollments.append(item)
    return dict(courses=courses,students=students,enrollments=enrollments)

def _xlsx_cell(value):
    value=str(value or '')
    return '<c t="inlineStr"><is><t>'+escape(value)+'</t></is></c>'

def students_xlsx(rows):
    """Small dependency-free XLSX exporter for the admin roster."""
    headers=['Nombre','Correo','Estado','Matrículas activas','Creado']
    data=[headers]+[[r.get('name',''),r.get('email',''),'En papelera' if r.get('deleted') else 'Activo' if r.get('active') else 'Deshabilitado',r.get('enrollments',0),datetime.fromtimestamp(r.get('created',0),LIMA).strftime('%Y-%m-%d') if r.get('created') else ''] for r in rows]
    body=''.join('<row r="%d">%s</row>'%(i,''.join(_xlsx_cell(v) for v in row)) for i,row in enumerate(data,1))
    files={
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Alumnos" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml':'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+body+'</sheetData></worksheet>'}
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as archive:
        for name,value in files.items():archive.writestr(name,value)
    return stream.getvalue()

def parse_student_sheet(raw,filename):
    """Read CSV or the simple XLSX shapes exported by Excel/this app."""
    if filename.lower().endswith('.csv'):
        import csv
        return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
    if not filename.lower().endswith(('.xlsx','.xls')):raise ValueError('Sube un archivo .xlsx o .csv.')
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            shared=[]
            if 'xl/sharedStrings.xml' in archive.namelist():
                root=ET.fromstring(archive.read('xl/sharedStrings.xml'));shared=[''.join(x.itertext()) for x in root]
            sheet=ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            rows=[]
            for row in sheet.findall('.//{*}row'):
                values=[]
                for cell in row.findall('{*}c'):
                    value=''.join(cell.find('{*}is').itertext()) if cell.find('{*}is') is not None else (cell.findtext('{*}v') or '')
                    if cell.get('t')=='s' and value.isdigit() and int(value)<len(shared):value=shared[int(value)]
                    values.append(value)
                rows.append(values)
    except (KeyError,zipfile.BadZipFile,ET.ParseError):raise ValueError('No se pudo leer el archivo Excel. Usa la plantilla descargable.')
    if not rows:return []
    headers=[str(x).strip().lower() for x in rows[0]]
    aliases={'nombre':'name','nombre completo':'name','name':'name','correo':'email','correo electrónico':'email','email':'email','contraseña':'password','password':'password','activo':'active','estado':'active'}
    mapped=[aliases.get(x,x) for x in headers];return [dict(zip(mapped,row+['']*(len(mapped)-len(row)))) for row in rows[1:] if any(str(x).strip() for x in row)]

def temporary_password():return 'Malba-'+secrets.token_urlsafe(10)+'!'

def enrollment_email(student,course,password,cms):
    """Send a branded welcome email when SMTP is configured; never expose the password in logs."""
    host=os.getenv('MALBA_SMTP_HOST') or os.getenv('SMTP_HOST')
    if not host:return {'sent':False,'reason':'SMTP no configurado'}
    port=int(os.getenv('MALBA_SMTP_PORT') or os.getenv('SMTP_PORT') or 587);user=os.getenv('MALBA_SMTP_USER') or os.getenv('SMTP_USER');secret=os.getenv('MALBA_SMTP_PASSWORD') or os.getenv('SMTP_PASSWORD');sender=os.getenv('MALBA_MAIL_FROM') or os.getenv('MAIL_FROM') or user
    url=os.getenv('MALBA_AULA_URL','https://malba-pmc.com/aula-virtual/')
    title=escape(course.get('title','Programa MALBA PMC'));name=escape(student.get('name',''))
    html='''<!doctype html><html><body style="margin:0;background:#f5f6fa;font-family:Arial,sans-serif;color:#003b73"><div style="max-width:620px;margin:28px auto;background:#fff;border:1px solid #e1e6ef;border-radius:14px;overflow:hidden"><div style="background:#003b73;padding:28px 32px;text-align:center"><img src="https://malba-pmc.com/assets/malba-pmc-logo.png" alt="MALBA PMC" width="190" style="background:#fff;padding:10px;border-radius:6px"></div><div style="padding:34px"><p style="color:#5d4594;font-weight:bold;margin:0 0 10px">AULA VIRTUAL MALBA PMC</p><h1 style="font-size:26px;margin:0 0 18px">Hola, %s</h1><p style="font-size:16px;line-height:1.6">Tu acceso ya está listo. Fuiste inscrito(a) en <strong>%s</strong>.</p><div style="background:#f0edf7;border-radius:10px;padding:20px;margin:24px 0"><p style="margin:0 0 8px"><strong>Correo:</strong> %s</p><p style="margin:0"><strong>Contraseña temporal:</strong> %s</p></div><a href="%s" style="display:inline-block;background:#5d4594;color:#fff;text-decoration:none;padding:14px 22px;border-radius:7px;font-weight:bold">Ingresar al aula virtual</a><p style="font-size:13px;line-height:1.6;color:#60738b;margin-top:24px">Por seguridad, cambia tu contraseña en el primer ingreso. Si necesitas ayuda, responde este correo.</p></div><div style="padding:18px 34px;border-top:1px solid #e1e6ef;color:#60738b;font-size:12px">MALBA PMC · Gestión, aprendizaje y experiencia aplicada</div></div></body></html>'''%(name,title,escape(student.get('email','')),escape(password),url)
    msg=EmailMessage();msg['Subject']='Tu acceso a '+course.get('title','MALBA PMC');msg['From']=sender;msg['To']=student['email'];msg.set_content('Tu acceso al aula virtual está listo. Ingresa en '+url+' con tu correo y contraseña temporal.');msg.add_alternative(html,subtype='html')
    if port==465:
        connection=smtplib.SMTP_SSL(host,port,timeout=15,context=ssl.create_default_context())
    else:
        connection=smtplib.SMTP(host,port,timeout=15)
    with connection as smtp:
        if port!=465 and os.getenv('MALBA_SMTP_TLS','1')!='0':smtp.starttls()
        if user and secret:smtp.login(user,secret)
        smtp.send_message(msg)
    return {'sent':True}

def certificate_pdf(snapshot,code,issued,root):
    try:
        from reportlab.pdfgen import canvas
        from reportlab.lib.colors import HexColor
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except ImportError:raise ValueError('Para generar certificados instala: py -m pip install -r requirements.txt')
    from xml.sax.saxutils import escape
    from reportlab.platypus import Paragraph
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    # Registration is guarded by the caller's LMS write lock.
    if 'MalbaOutfit' not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont('MalbaOutfit',str(root/'assets/fonts/outfit-regular.ttf')))
        pdfmetrics.registerFont(TTFont('MalbaOutfitBold',str(root/'assets/fonts/outfit-semibold.ttf')))
    stream=io.BytesIO();w,h=842,595;c=canvas.Canvas(stream,pagesize=(w,h));c.setTitle('Certificado MALBA PMC - '+snapshot['name']);c.setAuthor('MALBA PMC')
    blue=HexColor('#003B73');purple=HexColor('#5D4594');c.setFillColor(blue);c.rect(0,h-13,w,13,fill=1,stroke=0);c.setFillColor(purple);c.rect(0,0,w,8,fill=1,stroke=0)
    c.drawImage(ImageReader(str(root/'assets/malba-pmc-logo.png')),w/2-105,h-88,width=210,height=33,mask='auto',preserveAspectRatio=True)
    def para(value,y,size=16,bold=False,color=blue,width=720,maxheight=50):
        size=float(size)
        while True:
            p=Paragraph(escape(value),ParagraphStyle('certificate',fontName='MalbaOutfitBold' if bold else 'MalbaOutfit',fontSize=size,leading=size*1.25,textColor=color,alignment=TA_CENTER))
            _,height=p.wrap(width,150)
            if height<=maxheight or size<=7:break
            size-=.5
        p.drawOn(c,(w-width)/2,y-height)
    para(snapshot['certificate']['title'],479,21,True,maxheight=48)
    para(snapshot['title'],426,18,maxheight=48)
    para('Otorgado a',367,12,maxheight=20)
    para(snapshot['name'],339,30,True,purple,maxheight=65)
    para(snapshot['certificate']['statement'],254,15,width=675,maxheight=62)
    date=datetime.fromtimestamp(issued,LIMA).strftime('%d/%m/%Y')
    para(str(snapshot['hours'])+' horas académicas · Completado el '+date,177,12,maxheight=22)
    signature=snapshot['certificate'].get('signatureImage','')
    if signature and signature.startswith('assets/') and '..' not in signature and (root/signature).is_file():
        c.drawImage(ImageReader(str(root/signature)),w/2-65,133,width=130,height=27,mask='auto',preserveAspectRatio=True,anchor='c')
    para(snapshot['certificate']['issuer'],123,17,True,maxheight=24)
    para(snapshot['certificate']['role'],94,11,maxheight=26)
    c.setStrokeColor(HexColor('#ded8eb'));c.line(60,61,w-60,61);c.setFont('MalbaOutfit',8);c.setFillColor(blue);c.drawString(60,43,'Código de verificación: '+code);c.drawRightString(w-60,43,'malba-pmc.com/verificar-certificado/')
    if code!='VISTA-PREVIA':c.linkURL('https://malba-pmc.com/verificar-certificado/?codigo='+code,(60,32,w-60,58),relative=0)
    c.showPage();c.save();return stream.getvalue()

def render_pdf_page(h,cms,file,query):
    if file['ext']!='.pdf':raise ValueError('Solo los PDF admiten vista por páginas.')
    source=cms.STATE/'lms-files'/(file['id']+file['ext'])
    if not source.is_file():raise ValueError('El documento no está disponible.')
    page_number=int(query.get('page',['1'])[0]);width=640 if query.get('thumb')==['1'] else 1300
    if not 1<=page_number<=5000:raise ValueError('Página no válida.')
    stat=source.stat();version=hashlib.sha256(f"{stat.st_mtime_ns}-{stat.st_size}".encode()).hexdigest()[:16]
    cache=cms.STATE/'lms-previews';cache.mkdir(exist_ok=True)
    stem=file['id']+'-'+version;metadata=cache/(stem+'.json');target=cache/f'{stem}-{page_number}-{width}.png'
    # PDFium must never be called concurrently, even for different documents.
    with PDF_RENDER_LOCK:
        if target.is_file() and metadata.is_file():pages=json.loads(metadata.read_text(encoding='utf-8'))['pages']
        else:
            try:import pypdfium2 as pdfium
            except ImportError:raise ValueError('Instala la vista PDF: py -m pip install -r requirements.txt')
            try:
                with pdfium.PdfDocument(source) as document:
                    pages=len(document)
                    if not 1<=page_number<=pages:raise ValueError('La página no existe en este documento.')
                    page=document[page_number-1]
                    try:
                        w,hgt=page.get_size();scale=min(width/max(w,1),1800/max(hgt,1))
                        bitmap=page.render(scale=scale)
                        try:
                            im=bitmap.to_pil();temp=target.with_suffix('.tmp');im.save(temp,format='PNG');im.close();temp.replace(target)
                        finally:bitmap.close()
                    finally:page.close()
                metadata.write_text(json.dumps({'pages':pages}),encoding='utf-8')
            except pdfium.PdfiumError:raise ValueError('No se puede previsualizar este PDF. Descárgalo para abrirlo en tu equipo.')
    h.response(target.read_bytes(),mime='image/png',headers={'Content-Disposition':'inline; filename="pagina.pdf.png"','Cache-Control':'private, no-store','X-PDF-Pages':str(pages),'X-PDF-Page':str(page_number)})

def stream_file(h,cms,f,preview=False):
    path=cms.STATE/'lms-files'/(f['id']+f['ext'])
    if not path.is_file():h.response({'error':'Archivo no disponible.'},404);return
    size=f['size'];start=0;end=size-1;status=200
    requested=h.headers.get('Range')
    if requested:
        m=re.fullmatch(r'bytes=(\d*)-(\d*)',requested)
        if not m or not any(m.groups()):h.response('',416,headers={'Content-Range':f'bytes */{size}'});return
        if m[1]:start=int(m[1]);end=min(int(m[2]),end) if m[2] else end
        else:start=max(0,size-int(m[2]))
        if start>end or start>=size:h.response('',416,headers={'Content-Range':f'bytes */{size}'});return
        status=206
    h.send_response(status);h.send_header('Content-Type',mimetypes.guess_type('file'+f['ext'])[0] or 'application/octet-stream');h.send_header('Content-Length',str(end-start+1));h.send_header('Accept-Ranges','bytes');h.send_header('Cache-Control','private, no-store');h.send_header('X-Content-Type-Options','nosniff')
    h.send_header('Content-Disposition',('inline' if f['ext']=='.mp4' or preview and f['ext'] in ['.pdf','.png','.jpg','.jpeg','.webp'] else 'attachment')+"; filename*=UTF-8''"+quote(f['name']))
    if status==206:h.send_header('Content-Range',f'bytes {start}-{end}/{size}')
    h.send_header('X-Frame-Options','SAMEORIGIN');h.send_header('Referrer-Policy','same-origin')
    h.end_headers()
    if h.command=='HEAD':return
    with path.open('rb') as source:
        source.seek(start);remaining=end-start+1
        while remaining:
            chunk=source.read(min(1024*1024,remaining))
            if not chunk:break
            h.wfile.write(chunk);remaining-=len(chunk)

def handle(h,cms,method,path):
    """Return false only for paths owned by the existing website/CMS."""
    if path in ['/aula-virtual','/verificar-certificado']:
        h.response('',302,'text/plain',{'Location':path+'/'});return True
    if path in ['/aula-virtual/','/verificar-certificado/']:
        folder=path.strip('/');h.response((cms.ROOT/folder/'index.html').read_text(encoding='utf-8'),mime='text/html; charset=utf-8');return True
    if not path.startswith('/api/lms/'):return False
    try:
        admin_route=path.startswith('/api/lms/admin')
        if admin_route:
            actor=h.auth(csrf=method=='POST')
            if not actor:return True
        elif path not in ['/api/lms/login','/api/lms/session','/api/lms/verify']:
            actor=student_session(h,cms,csrf=method=='POST',allow_password=path in ['/api/lms/password','/api/lms/logout'])
            # Admins may download materials/certificates for review.
            if not actor and method=='GET' and (path.startswith('/api/lms/files/') or path.startswith('/api/lms/certificate/')):actor=h.session()
            if not actor:h.response({'error':'Inicia sesión para acceder al aula.'},401);return True
        else:actor=None
        if method=='GET':
            with cms.connect() as db:
                if path=='/api/lms/session':
                    s=student_session(h,cms,allow_password=True);h.response({'authenticated':bool(s),'student':{k:s[k] for k in ['student_id','name','email','force_password']} if s else None,'csrf':s['csrf'] if s else None});return True
                if path=='/api/lms/verify':
                    code=parse_qs(urlsplit(h.path).query).get('code',[''])[0]
                    row=db.execute('SELECT snapshot,issued FROM lms_certificates WHERE id=? AND revoked=0',(code,)).fetchone()
                    if not row:h.response({'error':'Certificado no encontrado o revocado.'},404)
                    else:
                        d=json.loads(row['snapshot']);h.response({'name':d['name'],'title':d['title'],'issued':row['issued'],'code':code})
                    return True
                if path in ['/api/lms/admin/preview','/api/lms/admin/certificate-preview']:
                    cid=parse_qs(urlsplit(h.path).query).get('course',[''])[0]
                    r=db.execute('SELECT draft FROM lms_courses WHERE id=?',(cid,)).fetchone()
                    if not r:raise ValueError('Curso no encontrado.')
                    c=json.loads(r['draft'])
                    if path.endswith('certificate-preview'):
                        snapshot={k:c[k] for k in ['title','hours','certificate']};snapshot['name']='Alumno de ejemplo';snapshot['certificate']={**snapshot['certificate'],'title':'VISTA PREVIA · '+snapshot['certificate']['title']}
                        with cms.LOCK:pdf=certificate_pdf(snapshot,'VISTA-PREVIA',time.time(),cms.ROOT)
                        h.response(pdf,mime='application/pdf',headers={'Content-Disposition':'inline; filename="Vista-previa-certificado.pdf"'})
                    else:h.response({'course':material_metadata(c,db)})
                    return True
                if path=='/api/lms/admin':h.response(admin_data(db));return True
                if path=='/api/lms/admin/students/export':
                    rows=[]
                    for s in db.execute('SELECT * FROM lms_students ORDER BY deleted,name'):
                        item=dict(s);item['enrollments']=db.execute('SELECT COUNT(*) FROM lms_enrollments WHERE student_id=? AND active=1',(s['id'],)).fetchone()[0];rows.append(item)
                    h.response(students_xlsx(rows),mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':'attachment; filename="alumnos-malba-pmc.xlsx"'});return True
                if path=='/api/lms/me':
                    certificates=[]
                    for row in db.execute('SELECT id,snapshot,issued FROM lms_certificates WHERE student_id=? AND revoked=0 ORDER BY issued DESC',(actor['student_id'],)):
                        snapshot=json.loads(row['snapshot']);certificates.append({'id':row['id'],'issued':row['issued'],'title':snapshot['title']})
                    h.response({'courses':student_view(db,actor['student_id']),'certificates':certificates});return True
                if path.startswith('/api/lms/files/'):
                    fid=path.rsplit('/',1)[-1];f=db.execute('SELECT * FROM lms_files WHERE id=?',(fid,)).fetchone()
                    if not f:h.response({'error':'Archivo no encontrado.'},404);return True
                    if 'student_id' in actor:
                        course=accessible(db,actor['student_id'],f['course_id'])
                        linked=any(l.get('videoFileId')==fid or any(x.get('fileId')==fid for x in l['resources']) for l in lessons(course))
                        if not linked:raise PermissionError('Este archivo no está publicado en tu curso.')
                    query=parse_qs(urlsplit(h.path).query)
                    if query.get('render')==['1']:render_pdf_page(h,cms,f,query)
                    else:stream_file(h,cms,f,query.get('preview')==['1'])
                    return True
                if path.startswith('/api/lms/certificate/'):
                    code=path.rsplit('/',1)[-1].removesuffix('.pdf');cert=db.execute('SELECT * FROM lms_certificates WHERE id=? AND revoked=0',(code,)).fetchone()
                    if not cert:h.response({'error':'Certificado no encontrado.'},404);return True
                    if 'student_id' in actor:
                        if actor['student_id']!=cert['student_id']:raise PermissionError('Este certificado pertenece a otro alumno.')
                    with cms.LOCK:pdf=certificate_pdf(json.loads(cert['snapshot']),code,cert['issued'],cms.ROOT)
                    h.response(pdf,mime='application/pdf',headers={'Content-Disposition':'attachment; filename="Certificado-MALBA-'+code[:8]+'.pdf"'});return True
        elif method=='POST':
            if path=='/api/lms/admin/upload':
                course_id=ident(h.headers.get('X-Course-Id',''));name=text(h.headers.get('X-File-Name','material'),200,True);name=Path(name.replace('\\','/')).name
                from urllib.parse import unquote
                name=unquote(name);ext=Path(name).suffix.lower();size=int(h.headers.get('Content-Length','0'))
                if ext not in ['.pdf','.docx','.xlsx','.pptx','.zip','.txt','.mp4','.png','.jpg','.jpeg','.webp'] or not 0<size<=MAX_UPLOAD:raise ValueError('Usa PDF, imágenes, Office, ZIP, TXT o MP4 de hasta 100 MB.')
                with cms.connect() as db:
                    if not db.execute('SELECT 1 FROM lms_courses WHERE id=?',(course_id,)).fetchone():raise ValueError('Guarda primero los datos generales del curso.')
                folder=cms.STATE/'lms-files';folder.mkdir(exist_ok=True);fid=uuid.uuid4().hex;dest=folder/(fid+ext)
                try:
                    with dest.open('wb') as target:
                        remaining=size
                        while remaining:
                            chunk=h.rfile.read(min(1024*1024,remaining))
                            if not chunk:raise ValueError('La carga se interrumpió.')
                            target.write(chunk);remaining-=len(chunk)
                    with dest.open('rb') as source:head=source.read(32)
                    valid=ext=='.pdf' and head.startswith(b'%PDF-') or ext in ['.docx','.xlsx','.pptx','.zip'] and head.startswith(b'PK') or ext=='.mp4' and head[4:8]==b'ftyp' or ext=='.txt' and b'\0' not in head or ext=='.png' and head.startswith(b'\x89PNG\r\n\x1a\n') or ext in ['.jpg','.jpeg'] and head.startswith(b'\xff\xd8\xff') or ext=='.webp' and head[:4]==b'RIFF' and head[8:12]==b'WEBP'
                    if not valid:raise ValueError('El contenido no coincide con el tipo del archivo.')
                    with cms.connect() as db:db.execute('INSERT INTO lms_files VALUES(?,?,?,?,?,?)',(fid,course_id,name,ext,size,time.time()))
                except Exception:
                    dest.unlink(missing_ok=True);raise
                h.response({'fileId':fid,'name':name,'size':size});return True
            body=h.body()
            if not isinstance(body,dict):raise ValueError('Solicitud inválida.')
            if path=='/api/lms/login':
                now=time.time();key='lms:'+h.client_address[0]
                with cms.LOCK:
                    attempts=cms.ATTEMPTS[key]
                    while attempts and now-attempts[0]>600:attempts.popleft()
                    if len(attempts)>=8:h.response({'error':'Demasiados intentos. Espera diez minutos.'},429);return True
                    attempts.append(now)
                email=str(body.get('email','')).strip().lower()[:254];password=str(body.get('password',''))[:1000]
                with cms.connect() as db:
                    user=db.execute('SELECT * FROM lms_students WHERE email=?',(email,)).fetchone();value=cms.password_hash(password,user['salt'] if user else '0'*32)
                    if not user or not user['active'] or not hmac.compare_digest(value,user['hash']):h.response({'error':'Correo o contraseña incorrectos.'},401);return True
                    sid=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(32)
                    db.execute('DELETE FROM lms_sessions WHERE created<? OR touched<?',(now-cms.SESSION_MAX,now-cms.SESSION_IDLE));db.execute('INSERT INTO lms_sessions VALUES(?,?,?,?,?)',(hashlib.sha256(sid.encode()).hexdigest(),user['id'],csrf,now,now))
                cookie=f'{COOKIE}={sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age={cms.SESSION_MAX}'+('; Secure' if h.server.secure_cookie else '')
                h.response({'ok':True},headers={'Set-Cookie':cookie});return True
            with cms.LOCK,cms.connect() as db:
                if path=='/api/lms/logout':
                    db.execute('DELETE FROM lms_sessions WHERE id=?',(actor['id'],));h.response({'ok':True},headers={'Set-Cookie':f'{COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});return True
                if path=='/api/lms/password':
                    current=text(body.get('currentPassword',''),256,True);password=text(body.get('password',''),256,True)
                    if len(password)<12:raise ValueError('Usa al menos 12 caracteres para tu nueva contraseña.')
                    user=db.execute('SELECT * FROM lms_students WHERE id=?',(actor['student_id'],)).fetchone()
                    if not hmac.compare_digest(cms.password_hash(current,user['salt']),user['hash']):raise ValueError('La contraseña actual no es correcta.')
                    if current==password:raise ValueError('Elige una contraseña diferente a la temporal.')
                    salt=secrets.token_hex(16);db.execute('UPDATE lms_students SET salt=?,hash=?,force_password=0 WHERE id=?',(salt,cms.password_hash(password,salt),actor['student_id']));db.execute('DELETE FROM lms_sessions WHERE student_id=? AND id!=?',(actor['student_id'],actor['id']));h.response({'ok':True});return True
                if path=='/api/lms/admin/course/save':
                    c=body['course'];validate_course(c,db,bool(body.get('publish')));old=db.execute('SELECT * FROM lms_courses WHERE id=?',(c['id'],)).fetchone()
                    if (old['revision'] if old else 0)!=body.get('revision'):h.response({'error':'Otro administrador modificó el curso. Recarga antes de continuar.'},409);return True
                    encoded=cms.dump(c);published=encoded if body.get('publish') else old['published'] if old else None;revision=old['revision']+1 if old else 1
                    db.execute('INSERT INTO lms_courses VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET draft=excluded.draft,published=excluded.published,revision=excluded.revision,updated=excluded.updated',(c['id'],encoded,published,revision,1,time.time()));h.response({'ok':True,'revision':revision,'published':bool(body.get('publish'))});return True
                if path=='/api/lms/admin/course/status':
                    row=db.execute('SELECT revision FROM lms_courses WHERE id=?',(body['id'],)).fetchone()
                    if not row:raise ValueError('Curso no encontrado.')
                    if row['revision']!=body.get('revision'):h.response({'error':'El curso cambió. Recarga el aula.'},409);return True
                    db.execute('UPDATE lms_courses SET active=?,revision=revision+1 WHERE id=?',(int(bool(body['active'])),body['id']));h.response({'ok':True});return True
                if path=='/api/lms/admin/student':
                    action=body.get('action')
                    if action in ('toggle','delete','restore'):
                        sid=ident(body.get('id',''));row=db.execute('SELECT id FROM lms_students WHERE id=?',(sid,)).fetchone()
                        if not row:raise ValueError('Alumno no encontrado.')
                        if action=='delete':db.execute('UPDATE lms_students SET deleted=1,active=0 WHERE id=?',(sid,));db.execute('DELETE FROM lms_sessions WHERE student_id=?',(sid,))
                        elif action=='restore':db.execute('UPDATE lms_students SET deleted=0,active=1 WHERE id=?',(sid,))
                        else:db.execute('UPDATE lms_students SET active=CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=? AND deleted=0',(sid,));
                        h.response({'ok':True});return True
                    name=text(body.get('name'),180,True);email=text(body.get('email'),254,True).lower();password=text(body.get('password',''),256);course_id=text(body.get('courseId',''),80);send_email=bool(body.get('sendEmail'))
                    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):raise ValueError('Revisa el correo del alumno.')
                    old=db.execute('SELECT * FROM lms_students WHERE id=?',(body.get('id',''),)).fetchone()
                    if course_id and not db.execute('SELECT 1 FROM lms_courses WHERE id=?',(course_id,)).fetchone():raise ValueError('El curso seleccionado no existe.')
                    if not old and not password and not send_email:raise ValueError('Indica una contraseña temporal o activa el envío por correo.')
                    if password and len(password)<12:raise ValueError('La contraseña temporal debe tener al menos 12 caracteres.')
                    if db.execute('SELECT id FROM lms_students WHERE email=? AND id!=?',(email,old['id'] if old else '')).fetchone():raise ValueError('Ya existe un alumno con ese correo.')
                    generated=password or (temporary_password() if send_email else '');sid=old['id'] if old else uuid.uuid4().hex;salt=secrets.token_hex(16) if generated else old['salt'];digest=cms.password_hash(generated,salt) if generated else old['hash'];active=int(bool(body.get('active',True)));forced=1 if generated else old['force_password']
                    deleted=int(old['deleted']) if old else 0
                    db.execute('INSERT INTO lms_students(id,name,email,salt,hash,active,force_password,created,deleted) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,salt=excluded.salt,hash=excluded.hash,active=excluded.active,force_password=excluded.force_password',(sid,name,email,salt,digest,active,forced,time.time(),deleted))
                    if generated or not active:db.execute('DELETE FROM lms_sessions WHERE student_id=?',(sid,))
                    email_status={'sent':False,'reason':'No solicitado'}
                    if course_id:
                        db.execute('INSERT INTO lms_enrollments VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,course_id) DO UPDATE SET active=1,expires=excluded.expires',(sid,course_id,1,'','',time.time()))
                        if send_email:
                            try:email_status=enrollment_email({'name':name,'email':email},json.loads(db.execute('SELECT draft FROM lms_courses WHERE id=?',(course_id,)).fetchone()[0]),generated,cms)
                            except Exception as exc:email_status={'sent':False,'reason':'SMTP: '+str(exc)[:180]}
                    h.response({'ok':True,'id':sid,'email':email_status});return True
                if path=='/api/lms/admin/students/import':
                    raw=base64.b64decode(str(body.get('content','')),validate=True);rows=parse_student_sheet(raw,text(body.get('filename','alumnos.xlsx'),120,True));course_id=body.get('courseId','');send=bool(body.get('sendEmail',True));created=updated=0;errors=[];emails=0
                    if len(rows)>500:raise ValueError('Puedes importar hasta 500 alumnos por archivo.')
                    for index,item in enumerate(rows,2):
                        try:
                            name=text(str(item.get('name','')),180,True);email=text(str(item.get('email','')),254,True).lower();password=text(str(item.get('password','')),256)
                            if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):raise ValueError('correo inválido')
                            old=db.execute('SELECT * FROM lms_students WHERE email=?',(email,)).fetchone();generated=password or temporary_password();salt=secrets.token_hex(16);active=str(item.get('active','1')).lower() not in ('0','no','false','deshabilitado','inactivo');sid=old['id'] if old else uuid.uuid4().hex
                            db.execute('INSERT INTO lms_students(id,name,email,salt,hash,active,force_password,created,deleted) VALUES(?,?,?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET name=excluded.name,salt=excluded.salt,hash=excluded.hash,active=excluded.active,force_password=excluded.force_password,deleted=0',(sid,name,email,salt,cms.password_hash(generated,salt),int(active),1,time.time()));updated+=1 if old else 0;created+=0 if old else 1
                            if course_id:
                                if not db.execute('SELECT 1 FROM lms_courses WHERE id=?',(ident(course_id),)).fetchone():raise ValueError('curso no encontrado')
                                db.execute('INSERT INTO lms_enrollments VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,course_id) DO UPDATE SET active=1,expires=excluded.expires',(sid,course_id,1,'','',time.time()))
                                if send:
                                    result=enrollment_email({'name':name,'email':email},{'title':json.loads(db.execute('SELECT draft FROM lms_courses WHERE id=?',(course_id,)).fetchone()[0])['title']},generated,cms)
                                    emails+=int(result['sent'])
                        except Exception as exc:errors.append({'row':index,'message':str(exc)[:160]})
                    h.response({'ok':True,'created':created,'updated':updated,'enrolled':sum(1 for x in rows if course_id)-len(errors),'emailsSent':emails,'errors':errors});return True
                if path=='/api/lms/admin/enroll':
                    student=ident(body['studentId']);course=ident(body['courseId']);expires=text(body.get('expires',''),10)
                    if expires:
                        if not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}',expires):raise ValueError('Usa una fecha con formato AAAA-MM-DD.')
                        try:datetime.strptime(expires,'%Y-%m-%d')
                        except ValueError:raise ValueError('Fecha de vencimiento inválida.')
                    if not db.execute('SELECT 1 FROM lms_students WHERE id=?',(student,)).fetchone() or not db.execute('SELECT 1 FROM lms_courses WHERE id=?',(course,)).fetchone():raise ValueError('Selecciona un alumno y un curso existentes.')
                    user=db.execute('SELECT * FROM lms_students WHERE id=?',(student,)).fetchone();course_row=db.execute('SELECT draft FROM lms_courses WHERE id=?',(course,)).fetchone()
                    if user['deleted']:raise ValueError('Restaura al alumno antes de matricularlo.')
                    password='';email_status={'sent':False,'reason':'No solicitado'}
                    if body.get('sendEmail') and body.get('active',True):
                        password=temporary_password();salt=secrets.token_hex(16);db.execute('UPDATE lms_students SET salt=?,hash=?,force_password=1 WHERE id=?',(salt,cms.password_hash(password,salt),student))
                        try:email_status=enrollment_email(dict(user),json.loads(course_row['draft']),password,cms)
                        except Exception as exc:email_status={'sent':False,'reason':'SMTP: '+str(exc)[:180]}
                    db.execute('INSERT INTO lms_enrollments VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,course_id) DO UPDATE SET active=excluded.active,expires=excluded.expires',(student,course,int(bool(body.get('active',True))),expires,'',time.time()));h.response({'ok':True,'email':email_status});return True
                if path=='/api/lms/admin/certificate/revoke':
                    db.execute('UPDATE lms_certificates SET revoked=1 WHERE id=?',(body['id'],));h.response({'ok':True});return True
                if path=='/api/lms/quiz':
                    course=accessible(db,actor['student_id'],ident(body['courseId']));lesson=next((x for x in lessons(course) if x['id']==ident(body['lessonId'])),None)
                    if not lesson or lesson['type']!='quiz':raise ValueError('Test no encontrado.')
                    qs=lesson['quiz']['questions'];answers=body.get('answers')
                    if not isinstance(answers,list) or len(answers)!=len(qs):raise ValueError('Responde todas las preguntas antes de enviar.')
                    for answer,q in zip(answers,qs):
                        if isinstance(answer,bool) or not isinstance(answer,int) or not 0<=answer<len(q['options']):raise ValueError('Selecciona una opción válida en cada pregunta.')
                    score=int(sum(a==q['correct'] for a,q in zip(answers,qs))*100/len(qs));passed=score>=lesson['quiz']['passPercent'];now=time.time()
                    db.execute('INSERT INTO lms_quiz_attempts VALUES(?,?,?,?,?,?,?,?)',(uuid.uuid4().hex,actor['student_id'],course['id'],lesson['id'],cms.dump(answers),score,int(passed),now))
                    if passed:db.execute('INSERT OR IGNORE INTO lms_progress VALUES(?,?,?,?)',(actor['student_id'],course['id'],lesson['id'],now))
                    db.execute('UPDATE lms_enrollments SET last_lesson=? WHERE student_id=? AND course_id=?',(lesson['id'],actor['student_id'],course['id']))
                    result=issue_certificate(db,cms,actor,course)
                    result.update(score=score,passed=passed,feedback=[{'correct':a==q['correct'],'explanation':q.get('explanation','')} for a,q in zip(answers,qs)])
                    h.response(result);return True
                if path=='/api/lms/progress':
                    c=accessible(db,actor['student_id'],ident(body['courseId']));lid=ident(body['lessonId']);lesson=next((x for x in lessons(c) if x['id']==lid),None)
                    if not lesson:raise ValueError('Lección no encontrada.')
                    if lesson['type']=='quiz' and body.get('completed') is True:raise ValueError('Aprueba el test para completar esta lección.')
                    if 'completed' in body:
                        if not isinstance(body['completed'],bool):raise ValueError('Avance inválido.')
                        if body['completed']:db.execute('INSERT OR IGNORE INTO lms_progress VALUES(?,?,?,?)',(actor['student_id'],c['id'],lid,time.time()))
                        else:db.execute('DELETE FROM lms_progress WHERE student_id=? AND course_id=? AND lesson_id=?',(actor['student_id'],c['id'],lid))
                    db.execute('UPDATE lms_enrollments SET last_lesson=? WHERE student_id=? AND course_id=?',(lid,actor['student_id'],c['id']))
                    h.response(issue_certificate(db,cms,actor,c));return True
        h.response({'error':'Ruta no encontrada.'},404)
    except PermissionError as e:h.response({'error':str(e)},403)
    except (ValueError,KeyError,TypeError,OverflowError) as e:h.response({'error':str(e)[:250]},400)
    except Exception:h.response({'error':'No se pudo completar la operación del aula. Revisa el servidor.'},500)
    return True

def seed_demo(cms):
    """Explicit local fixture only; never add students during ordinary startup."""
    with cms.connect() as db:
        if db.execute('SELECT 1 FROM lms_students WHERE email=?',('alumno.demo@malba.test',)).fetchone():return None
        password=secrets.token_urlsafe(14);salt=secrets.token_hex(16);sid=uuid.uuid4().hex;cid=uuid.uuid4().hex
        c={'id':cid,'title':'Curso de demostración · Gestión de proyectos','description':'Contenido de prueba para validar el recorrido del aula. No corresponde a un programa académico real.','instructor':'Equipo MALBA PMC','hours':2,'image':'assets/programs/pmo-960.webp','sourceProgramId':'','certificate':{'enabled':True,'title':'Certificado de finalización','statement':'Ha completado las lecciones obligatorias del curso de demostración. Documento de prueba, sin validez académica.','issuer':'MALBA PMC','role':'Aula virtual · Demostración'},'modules':[{'id':uuid.uuid4().hex,'title':'Primeros pasos','lessons':[{'id':uuid.uuid4().hex,'title':title,'type':'text','body':body,'minutes':10,'required':True,'videoUrl':'','videoFileId':'','meetingUrl':'','resources':[]} for title,body in [('Bienvenida al aula','Este curso permite probar el acceso, la navegación y el avance. Marca la lección como completada cuando termines de revisarla.'),('Planificación y seguimiento','Define el alcance, identifica hitos y revisa restricciones. Esta lección de ejemplo cierra el recorrido y habilita un certificado de demostración.')]]}]}
        db.execute('INSERT INTO lms_students(id,name,email,salt,hash,active,force_password,created,deleted) VALUES(?,?,?,?,?,1,1,?,0)',(sid,'Alumno de demostración','alumno.demo@malba.test',salt,cms.password_hash(password,salt),time.time()));db.execute('INSERT INTO lms_courses VALUES(?,?,?,1,1,?)',(cid,cms.dump(c),cms.dump(c),time.time()));db.execute('INSERT INTO lms_enrollments VALUES(?,?,1,?,?,?)',(sid,cid,'','',time.time()))
        return password
