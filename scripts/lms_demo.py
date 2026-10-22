"""Explicit, idempotent local demo. Never modifies real students or existing course editions."""
import io,json,secrets,time,uuid,zipfile
from pathlib import Path
import lms

COURSE_ID='malba-demo-gestion-proyectos-completo-v1'


INTRODUCTION=('En este curso conocerás cómo convertir una idea de proyecto en un plan de trabajo que pueda ejecutarse y controlarse. Usaremos como hilo conductor un caso de infraestructura eléctrica: organizar la implementación de una subestación y responder al posible retraso de un equipo crítico.\n\n'
'Primero definirás el alcance y los entregables; luego relacionarás actividades, hitos y responsables. Después revisarás cómo identificar riesgos y evaluar decisiones que afectan el plazo, el costo y los resultados del proyecto.\n\n'
'Al terminar podrás estructurar un plan inicial, registrar riesgos con respuestas y responsables, y reconocer qué revisar al controlar cambios y cerrar el proyecto. Los videos, la guía, el caso resuelto y las plantillas acompañan cada etapa.\n\n'
'Este es un curso de demostración del aula virtual. Su avance inicial y su certificado se han preparado para pruebas, sin validez académica.')
DESCRIPTION='Aprende a organizar el alcance, los hitos y los riesgos de un proyecto mediante un caso práctico, videos de apoyo y plantillas de trabajo.'
OLD_BODIES={
'demo-lesson-bienvenida':'Este curso contiene materiales reales de prueba, dos videos incrustados y una evaluación rápida. La cuenta de demostración se entrega al 100% para revisar el certificado; puedes recorrer las lecciones y volver a responder el test.\n\nLos avances y resultados iniciales son simulados exclusivamente para probar el sistema. No representan una matrícula o acreditación académica real.',
'demo-lesson-planificacion':'Revisa el video incrustado y relaciona sus ideas con el caso de práctica. Descarga el paquete de plantillas para registrar los hitos, riesgos y decisiones de tu proyecto de demostración.',
'demo-lesson-riesgos':'Utiliza este segundo recurso audiovisual como apoyo para identificar decisiones y preguntas de gestión. Los videos pertenecen a los recursos que MALBA ya presenta en su web; no es una grabación de un programa matriculado.',
'demo-lesson-caso':'Analiza el posible retraso de un equipo crítico. Identifica la causa, el impacto, la respuesta propuesta y quién debe hacer seguimiento.\n\nDescarga el caso resuelto y compara sus pasos con la plantilla de riesgos.',
'demo-lesson-test':'Responde las cuatro preguntas. La nota mínima es 70%. El sistema corrige las respuestas y guarda el resultado. Puedes volver a intentarlo.',
'demo-lesson-cierre':'Revisa la lista de cierre y entra a Mis certificados para descargar tu documento de demostración. El certificado contiene tu nombre, las horas, la fecha de emisión y un código verificable.\n\nEste curso y su certificado se han creado exclusivamente para validar el aula virtual.'}
BODIES={
'demo-lesson-bienvenida':'Un proyecto necesita más que una lista de tareas: requiere acordar qué se entregará, cómo se organizará el trabajo y cómo se tomarán las decisiones. En este recorrido trabajarás esas bases con un caso sencillo de infraestructura eléctrica.\n\nEl primer módulo conecta alcance, entregables, actividades e hitos. El segundo presenta un riesgo de suministro y compara posibles respuestas. El último reúne un test breve y una lista de cierre para consolidar lo aprendido.\n\nEmpieza revisando la guía de planificación. Usa la fotografía de apoyo para identificar cómo un equipo puede revisar información y coordinar decisiones. Después descarga las plantillas de la siguiente lección y aplícalas al caso.',
'demo-lesson-planificacion':'Planificar permite transformar el resultado esperado en una secuencia de trabajo: qué se hará, en qué orden, con qué responsables y cuáles serán los hitos para revisar el avance. Esta lección te ayuda a relacionar esas piezas antes de construir un cronograma.\n\nRevisa el video de apoyo y responde: ¿cuáles son los entregables principales del caso?, ¿qué actividades dependen de otras? y ¿qué decisiones necesitan validarse antes de empezar?\n\nAbre el paquete de plantillas y registra cuatro hitos, un responsable por hito y una semana prevista. Los valores del archivo son un ejemplo de práctica que puedes modificar.',
'demo-lesson-riesgos':'Un riesgo es un evento incierto que puede afectar los objetivos del proyecto. Identificarlo a tiempo permite preparar una respuesta y asignar un responsable, en lugar de esperar a que se convierta en un problema.\n\nUtiliza el video de apoyo para reflexionar sobre las decisiones del equipo. En nuestro caso, considera el posible retraso de un equipo crítico: describe su causa, su efecto sobre las actividades y una alternativa de respuesta.\n\nCompleta la plantilla de riesgos del módulo anterior. Para cada riesgo registra una respuesta y la persona que revisará su estado. Este video es un recurso de apoyo de MALBA, no una grabación de un programa matriculado.',
'demo-lesson-caso':'Ahora conectarás planificación y riesgos con una decisión concreta. El proyecto de demostración tiene un plazo de doce semanas y un equipo crítico podría llegar dos semanas después de lo previsto. El reto consiste en evaluar alternativas antes de comprometer una nueva fecha.\n\nEl documento resuelto muestra cómo describir el riesgo, revisar actividades dependientes y comparar respuestas. Lee primero la situación, propone tu decisión y luego contrástala con el análisis del archivo.\n\nPregúntate qué información falta, quién debe decidir y cómo se comprobará que la respuesta está funcionando. No existe una decisión útil sin un criterio y un seguimiento claros.',
'demo-lesson-test':'Este test reúne los conceptos principales del recorrido: definir el alcance, organizar el trabajo, gestionar riesgos, evaluar cambios y aprender del cierre. Te permitirá comprobar qué ideas puedes aplicar al caso de práctica.\n\nResponde las cuatro preguntas y revisa la explicación de cada resultado. La nota mínima es 70%; si no la alcanzas, puedes volver a intentarlo después de repasar las lecciones.',
'demo-lesson-cierre':'Cerrar un proyecto implica confirmar que los entregables fueron aceptados, ordenar los pendientes y conservar el aprendizaje. Esta última lección reúne los puntos que conviene revisar antes de dar por terminado el trabajo.\n\nDescarga la lista de cierre y contrástala con tu plan de hitos, tu registro de riesgos y las decisiones del caso. Identifica una mejora que aplicarías en un siguiente proyecto.\n\nEl documento de demostración del curso se consulta desde Mis certificados. Su disponibilidad inicial permite probar el aula y no constituye una acreditación académica real.'}


def attach_photo(cms,db):
    name='Equipo-de-planificacion.webp';fid=uuid.uuid5(uuid.NAMESPACE_URL,COURSE_ID+'/'+name).hex
    source=cms.ROOT/'assets/programs/pmo-960.webp';folder=cms.STATE/'lms-files';folder.mkdir(exist_ok=True)
    target=folder/(fid+'.webp')
    if not target.exists():target.write_bytes(source.read_bytes())
    db.execute('INSERT OR IGNORE INTO lms_files VALUES(?,?,?,?,?,?)',(fid,COURSE_ID,name,'.webp',target.stat().st_size,time.time()))
    return {'fileId':fid,'name':name,'url':''}


def upgrade_demo(cms):
    # Only fill missing introductions and replace the exact shipped demo copy.
    # Keep user edits, publication state, passwords, progress and certificate snapshots.
    with cms.LOCK,cms.connect() as db:
        row=db.execute('SELECT * FROM lms_courses WHERE id=?',(COURSE_ID,)).fetchone()
        if not row:return
        photo=attach_photo(cms,db);versions={};changed=False
        for field in ['draft','published']:
            if not row[field]:versions[field]=None;continue
            course=json.loads(row[field]);before=cms.dump(course)
            if not course.get('introduction'):course['introduction']=INTRODUCTION
            if course.get('description')=='Curso completo de prueba con tres módulos, seis lecciones, videos incrustados, cuatro materiales descargables, un test rápido y certificado disponible.':course['description']=DESCRIPTION
            for lesson in lms.lessons(course):
                if lesson.get('body')==OLD_BODIES.get(lesson['id']):lesson['body']=BODIES[lesson['id']]
                if lesson['id']=='demo-lesson-bienvenida' and not any(r.get('fileId')==photo['fileId'] for r in lesson['resources']):lesson['resources'].append(photo.copy())
            versions[field]=cms.dump(course);changed|=before!=versions[field]
        if changed:db.execute('UPDATE lms_courses SET draft=?,published=?,revision=revision+1,updated=? WHERE id=?',(versions['draft'],versions['published'],time.time(),COURSE_ID))


def pdf_material(root,title,sections):
    from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Image
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.colors import HexColor
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from xml.sax.saxutils import escape
    if 'MalbaDemo' not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont('MalbaDemo',str(root/'assets/fonts/outfit-regular.ttf')))
    styles=getSampleStyleSheet()
    for name in ['Title','Heading2','BodyText']:
        styles[name].fontName='MalbaDemo';styles[name].textColor=HexColor('#003B73');styles[name].leading=styles[name].fontSize*1.5
    stream=io.BytesIO();doc=SimpleDocTemplate(stream,rightMargin=48,leftMargin=48,topMargin=38,bottomMargin=40)
    story=[Image(str(root/'assets/malba-pmc-logo.png'),width=200,height=31),Spacer(1,24),Paragraph(escape(title),styles['Title']),Paragraph('Material de demostración del aula virtual. Uso exclusivo para pruebas; no corresponde a una certificación académica.',styles['BodyText']),Spacer(1,18)]
    for heading,body in sections:story.extend([Paragraph(escape(heading),styles['Heading2']),Paragraph(escape(body),styles['BodyText']),Spacer(1,12)])
    doc.build(story);return stream.getvalue()

def seed(cms):
    with cms.connect() as db:exists=bool(db.execute('SELECT 1 FROM lms_courses WHERE id=?',(COURSE_ID,)).fetchone())
    if exists:
        upgrade_demo(cms);return None
    # Build real resources before changing the database, so a missing PDF dependency leaves no partial course.
    guide=pdf_material(cms.ROOT,'Guía práctica de planificación del proyecto',[
        ('1. Define el resultado esperado','Caso de práctica: implementar una subestación de demostración. Define el resultado, los entregables, los criterios de aceptación y qué queda fuera del alcance.'),
        ('2. Organiza el trabajo','Descompón los entregables en actividades. Para cada actividad identifica un responsable, una duración estimada y sus dependencias.'),
        ('3. Revisa los riesgos','Describe un evento incierto, su causa y su efecto. Prioriza los riesgos según probabilidad e impacto, y asigna una respuesta y un responsable.'),
        ('4. Controla los cambios','Compara lo ejecutado con el plan. Antes de aceptar un cambio, revisa sus efectos sobre alcance, plazo, costo y riesgos.'),
        ('Ejercicio','Completa la plantilla del paquete descargable: registra cuatro hitos, tres riesgos y dos decisiones. Revisa el ejemplo resuelto y responde el test del módulo final.')])
    case=pdf_material(cms.ROOT,'Caso resuelto: decisiones de un proyecto',[
        ('Situación inicial','Un proyecto de demostración tiene un plazo de doce semanas. La entrega de un equipo crítico podría retrasarse dos semanas. El equipo aún no ha formalizado una alternativa.'),
        ('Diagnóstico','El riesgo debe registrarse con su causa y su impacto potencial sobre el cronograma. El responsable confirma la fecha probable de entrega y revisa actividades dependientes.'),
        ('Respuesta propuesta','Evaluar un proveedor alternativo y revisar la secuencia de actividades. Comparar costo adicional, plazo y requisitos antes de elevar la decisión.'),
        ('Seguimiento','Registrar el responsable, la fecha de revisión y una señal de activación. Actualizar el estado del riesgo con evidencia y comunicar la decisión a los interesados.'),
        ('Lección de práctica','Tener una lista de riesgos no equivale a gestionarlos. Cada riesgo priorizado necesita una respuesta, un responsable y seguimiento.')])
    bundle=io.BytesIO()
    with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('01-hitos.csv','﻿Hito;Responsable;Semana planificada;Estado\nAlcance aprobado;Jefe de proyecto;1;Pendiente\nPlan aprobado;Equipo de proyecto;2;Pendiente\nEquipo recibido;Compras;6;Pendiente\nCierre validado;Jefe de proyecto;12;Pendiente\n')
        z.writestr('02-riesgos.csv','﻿Riesgo;Causa;Impacto;Probabilidad;Respuesta;Responsable\nRetraso de equipo;Proveedor;Plazo;Media;Evaluar alternativa;Compras\n')
        z.writestr('03-decisiones.csv','﻿Fecha;Decisión;Alternativas;Impacto;Responsable\n;Seleccionar proveedor;A o B;Revisar plazo y costo;Jefe de proyecto\n')
        z.writestr('LEEME.txt','Plantillas de demostración MALBA. Abre los archivos CSV en Excel o una hoja de cálculo. Separador: punto y coma. No son documentos de un proyecto real.')
    materials=[('Guia-de-planificacion.pdf',guide),('Caso-practico-resuelto.pdf',case),('Plantillas-del-proyecto.zip',bundle.getvalue()),('Lista-de-cierre.txt','LISTA DE CIERRE - DEMOSTRACIÓN MALBA\n[ ] Confirmar aceptación de entregables\n[ ] Registrar decisiones y pendientes\n[ ] Consolidar lecciones aprendidas\n[ ] Archivar materiales\n[ ] Revisar el test y descargar el certificado de prueba\n'.encode())]
    folder=cms.STATE/'lms-files';folder.mkdir(exist_ok=True)
    resources=[];files=[]
    for name,raw in materials:
        fid=uuid.uuid5(uuid.NAMESPACE_URL,COURSE_ID+'/'+name).hex;ext=Path(name).suffix;(folder/(fid+ext)).write_bytes(raw);files.append((fid,COURSE_ID,name,ext,len(raw),time.time()));resources.append({'fileId':fid,'name':name,'url':''})
    def lesson(key,title,body,kind='text',video='',refs=None,quiz=None):
        result={'id':'demo-lesson-'+key,'title':title,'type':kind,'body':body,'minutes':15,'required':True,'videoUrl':video,'videoFileId':'','meetingUrl':'','resources':refs or []}
        if quiz:result['quiz']=quiz
        return result
    quiz={'passPercent':70,'questions':[
        {'question':'¿Qué se debe definir antes de organizar las actividades del proyecto?','options':['El resultado esperado y los entregables','Solo el precio de los materiales','Únicamente el formato del informe'],'correct':0,'explanation':'El alcance orienta la identificación de entregables y la organización del trabajo.'},
        {'question':'¿Qué necesita un riesgo priorizado para poder gestionarse?','options':['Solo un nombre en una lista','Una respuesta, un responsable y seguimiento','Esperar a que ocurra'],'correct':1,'explanation':'La gestión incluye acciones, responsables y seguimiento; registrar el riesgo es solo el inicio.'},
        {'question':'Antes de aceptar un cambio, ¿qué conviene revisar?','options':['Solo quién lo solicita','Solo la fecha de la solicitud','Su efecto sobre alcance, plazo, costo y riesgos'],'correct':2,'explanation':'La evaluación del cambio debe considerar sus efectos sobre los objetivos y restricciones del proyecto.'},
        {'question':'¿Cuál es una práctica útil al cerrar un proyecto?','options':['Consolidar lecciones aprendidas y confirmar la aceptación','Eliminar todas las decisiones registradas','Dejar abiertos todos los pendientes'],'correct':0,'explanation':'El cierre reúne la aceptación, el registro de pendientes y el aprendizaje para proyectos siguientes.'} ]}
    modules=[{'id':'demo-module-fundamentos','title':'Fundamentos y planificación','lessons':[
        lesson('bienvenida','Bienvenida y ruta de aprendizaje','Este curso contiene materiales reales de prueba, dos videos incrustados y una evaluación rápida. La cuenta de demostración se entrega al 100% para revisar el certificado; puedes recorrer las lecciones y volver a responder el test.\n\nLos avances y resultados iniciales son simulados exclusivamente para probar el sistema. No representan una matrícula o acreditación académica real.',refs=[resources[0]]),
        lesson('planificacion','Video: planificación y dirección de proyectos','Revisa el video incrustado y relaciona sus ideas con el caso de práctica. Descarga el paquete de plantillas para registrar los hitos, riesgos y decisiones de tu proyecto de demostración.','video','https://www.youtube.com/watch?v=NrEJvAJ7NGo',[resources[2]])]},
        {'id':'demo-module-aplicacion','title':'Riesgos y decisiones','lessons':[
        lesson('riesgos','Video: aprendizaje aplicado a los proyectos','Utiliza este segundo recurso audiovisual como apoyo para identificar decisiones y preguntas de gestión. Los videos pertenecen a los recursos que MALBA ya presenta en su web; no es una grabación de un programa matriculado.','video','https://www.youtube.com/watch?v=RRj4MDh8rNQ'),
        lesson('caso','Caso práctico resuelto','Analiza el posible retraso de un equipo crítico. Identifica la causa, el impacto, la respuesta propuesta y quién debe hacer seguimiento.\n\nDescarga el caso resuelto y compara sus pasos con la plantilla de riesgos.',refs=[resources[1]])]},
        {'id':'demo-module-cierre','title':'Evaluación y certificado','lessons':[
        lesson('test','Test rápido de conocimientos','Responde las cuatro preguntas. La nota mínima es 70%. El sistema corrige las respuestas y guarda el resultado. Puedes volver a intentarlo.','quiz',quiz=quiz),
        lesson('cierre','Cierre y siguientes pasos','Revisa la lista de cierre y entra a Mis certificados para descargar tu documento de demostración. El certificado contiene tu nombre, las horas, la fecha de emisión y un código verificable.\n\nEste curso y su certificado se han creado exclusivamente para validar el aula virtual.',refs=[resources[3]])]}]
    course={'id':COURSE_ID,'title':'Gestión de proyectos: planificación, riesgos y control · Demo completa','description':DESCRIPTION,'introduction':INTRODUCTION,'instructor':'Equipo MALBA PMC · Demostración','hours':4,'image':'assets/programs/pmo-960.webp','sourceProgramId':'','certificate':{'enabled':True,'title':'Certificado de demostración','statement':'Documento de prueba del aula virtual. Finalización y resultado inicial simulados, sin validez académica.','issuer':'MALBA PMC','role':'Entorno de demostración','signatureImage':''},'modules':modules}
    password=None;now=time.time()
    with cms.LOCK,cms.connect() as db:
        if db.execute('SELECT 1 FROM lms_courses WHERE id=?',(COURSE_ID,)).fetchone():return None
        for f in files:db.execute('INSERT OR IGNORE INTO lms_files VALUES(?,?,?,?,?,?)',f)
        photo=attach_photo(cms,db)
        for lesson in lms.lessons(course):
            lesson['body']=BODIES[lesson['id']]
            if lesson['id']=='demo-lesson-bienvenida':lesson['resources'].append(photo)
        lms.validate_course(course,db,True)
        student=db.execute('SELECT * FROM lms_students WHERE email=?',('alumno.demo@malba.test',)).fetchone()
        if not student:
            sid=uuid.uuid4().hex;password=secrets.token_urlsafe(14);salt=secrets.token_hex(16)
            db.execute('INSERT INTO lms_students(id,name,email,salt,hash,active,force_password,created,deleted) VALUES(?,?,?,?,?,1,1,?,0)',(sid,'Alumno de demostración','alumno.demo@malba.test',salt,cms.password_hash(password,salt),now))
        else:sid=student['id']
        db.execute('INSERT INTO lms_courses VALUES(?,?,?,1,1,?)',(COURSE_ID,cms.dump(course),cms.dump(course),now))
        db.execute('INSERT INTO lms_enrollments VALUES(?,?,1,?,?,?)',(sid,COURSE_ID,'','demo-lesson-cierre',now))
        for lesson in lms.lessons(course):db.execute('INSERT INTO lms_progress VALUES(?,?,?,?)',(sid,COURSE_ID,lesson['id'],now))
        db.execute('INSERT INTO lms_quiz_attempts VALUES(?,?,?,?,?,?,?,?)',(uuid.uuid4().hex,sid,COURSE_ID,'demo-lesson-test',cms.dump([0,1,2,0]),100,1,now))
        name=student['name'] if student else 'Alumno de demostración';lms.issue_certificate(db,cms,{'student_id':sid,'name':name},course)
    return password
