# Aula virtual inicial de MALBA PMC

LMS propio integrado al servidor Python y al dashboard existentes. No requiere WordPress ni Tutor LMS. La referencia de Tutor LMS se utiliza para la organización del aprendizaje y la administración; esta entrega cubre el LMS inicial de la propuesta comercial, no todos los módulos comerciales de Tutor.

## Iniciar y probar

```powershell
git pull origin feature/menu-banner-v1
py -m pip install -r requirements.txt
py scripts/cms_server.py --demo-lms
```

- Alumnos: `http://localhost:8080/aula-virtual/`.
- Administrador: `http://localhost:8080/dashboard/`, opción **Aula virtual**. Se mantienen las credenciales del CMS.
- Verificación: `http://localhost:8080/verificar-certificado/`.

`--demo-lms` es opcional y funciona únicamente en localhost. La primera vez crea un curso claramente identificado como demostración, con tres módulos, seis lecciones, dos videos incrustados, cinco descargables y un test de cuatro preguntas, además de un alumno `alumno.demo@malba.test`. Imprime una contraseña temporal aleatoria una sola vez; el alumno debe cambiarla al ingresar. El curso nuevo se matricula al 100% para la cuenta de demostración, con un intento aprobado y un certificado explícitamente simulado. Si la cuenta ya existía, mantiene su contraseña. La operación es idempotente y conserva cursos y avances existentes. No crea usuarios ni cursos al iniciar normalmente. Si el alumno de prueba ya existe, conserva sus datos: restablece su contraseña desde el dashboard si la necesitas.

## Administrador

1. En **Cursos**, crea un curso independiente o vincúlalo a un programa de Academia para precargar nombre, presentación, portada y horas. La ficha comercial y las lecciones privadas se editan por separado.
2. El editor tiene cuatro pasos: **Datos del curso → Contenido → Certificado → Revisión**. Se puede guardar y retomar un borrador. La vista previa muestra la experiencia del alumno sin generar avance ni certificados.
3. Añade módulos y lecciones de texto, video, sesión en vivo o test rápido. Cambia su orden, marca lecciones obligatorias/complementarias y adjunta recursos. Los videos admiten YouTube, Vimeo, MP4 HTTPS o archivos privados MP4. Las sesiones en vivo abren el enlace de Zoom, Meet u otro proveedor; las instrucciones y horario se colocan en el contenido.
4. Materiales privados: PDF, PNG, JPG, WebP, DOCX, XLSX, PPTX, ZIP y TXT; videos MP4, hasta 100 MB por archivo. Las portadas y firmas admiten PNG, JPG o WebP de hasta 5 MB. Para videos mayores usa un proveedor de streaming y conserva sus permisos de acceso. Los enlaces externos mantienen la privacidad configurada en el proveedor.
5. Personaliza título, texto, responsable, cargo y firma opcional del certificado. Descarga una prueba PDF identificada como vista previa.
6. Publica la edición. El servidor verifica el contenido obligatorio; guardar borrador no cambia el curso visible. Deshabilitar el curso suspende el acceso y conserva matrículas/avance. Las revisiones impiden sobrescribir una edición concurrente.
7. En **Alumnos**, crea el acceso con correo y contraseña temporal, importa hasta 500 alumnos desde `.xlsx`/`.csv` y exporta el padrón en Excel. Los registros pueden habilitarse, deshabilitarse, restaurarse o enviarse a la papelera sin perder matrículas ni avance.
8. En **Matrículas y avance**, asigna alumno/curso, configura un vencimiento opcional, suspende/reactiva accesos y revisa el porcentaje real calculado por el servidor. Puedes descargar certificados y revocarlos.

Los cambios del aula tienen sus propios botones Guardar/Publicar. No se mezclan con los borradores o el historial de la web comercial.

## Alumno

El alumno ingresa con su correo, cambia su contraseña temporal y ve únicamente sus cursos publicados con matrícula vigente. Puede buscar/filtrar, retomar la última lección, consultar videos, descargar recursos y marcar lecciones como completadas. El avance de texto y video se declara al marcar la lección; no comprueba tiempo de reproducción. Los tests rápidos se corrigen en el servidor, guardan intentos y requieren la nota mínima para completar su lección. Las respuestas correctas no se envían en el catálogo del alumno.

Completar todas las lecciones obligatorias de un curso con certificación habilita un certificado. Las complementarias no bloquean el curso. El certificado incluye el nombre del alumno, programa, horas académicas, fecha en Perú, responsable y código verificable. Se conserva una instantánea de los datos de emisión: editar el curso o perfil posteriormente no cambia un certificado ya emitido. Los certificados válidos permanecen en **Mis certificados** incluso si vence una matrícula. Para invalidar uno, el administrador usa Revocar.

La composición del certificado toma como referencia el adjunto `CertiMalba.webp`, adaptada a Academia y la marca MALBA PMC. No copia el nombre, las medallas ni los resultados del simulador de la imagen. La firma es opcional y la aporta el administrador; no se genera ni se falsifica una firma.

## Datos, seguridad y despliegue

- SQLite existente, con tablas `lms_*` separadas del contenido público. Identidades, contraseñas protegidas con hash PBKDF2, sesiones, matrículas, avance y certificados no se guardan en JSON público.
- Cookies HttpOnly, SameSite, expiración de sesión, cambio de contraseña inicial, límites de intentos y CSRF en operaciones autenticadas. En HTTPS, iniciar con `--secure-cookie` detrás del proxy.
- Materiales y MP4 en `.cms-private/lms-files/`, fuera de las rutas públicas. Cada descarga requiere sesión y autorización al curso publicado; los archivos de borradores no se exponen a alumnos. Los MP4 soportan peticiones Range para reproducción.
- La verificación pública requiere el código aleatorio del documento y muestra únicamente nombre, curso y fecha. La descarga exige sesión del titular o administrador.
- Para respaldar, detén el servidor y copia la carpeta privada completa y `assets/uploads/`. Nunca la subas a GitHub ni a un directorio público. Las portadas y firmas se guardan en la carpeta de imágenes del sitio; no uses esa carpeta para materiales privados.
- El ZIP de **Descargar web publicada** sigue siendo una exportación estática de la web y las pantallas del aula. No contiene alumnos, sesiones, matrículas, materiales privados ni el backend; no funciona como LMS en un hosting que solo sirva HTML. El LMS requiere ejecutar este backend Python con almacenamiento persistente y HTTPS. No se ha desplegado esta entrega en Hostinger ni migrado usuarios de Tutor LMS.
- Las matrículas de esta versión las gestiona el administrador. Al matricular, el panel puede enviar un correo HTML con la URL del aula, credenciales temporales y datos del curso. Configura `MALBA_SMTP_HOST`, `MALBA_SMTP_PORT`, `MALBA_SMTP_USER`, `MALBA_SMTP_PASSWORD`, `MALBA_MAIL_FROM` (o `SMTP_FROM`), `MALBA_AULA_URL` y opcionalmente `MALBA_SMTP_TLS=0` en el servidor. Para Hostinger puedes usar `smtp.hostinger.com` con puerto `465` (SSL) o `587` (STARTTLS); el código detecta automáticamente el puerto 465. Sin SMTP, la matrícula se guarda y el panel avisa que el correo quedó pendiente.

## Verificación

`py -m unittest discover -s tests` ejecuta pruebas con sitio y base desechables: roles, contraseñas, CSRF, acceso por matrícula, borradores, publicación, avances, PDFs, verificación, suspensión y persistencia. La revisión de navegador cubre creación/publicación, materiales, videos, matrícula, primer ingreso, avance, reanudación y certificados, además de tamaños de 320 px a escritorio.

## Prueba completa

Al ejecutar `--demo-lms`, busca **Gestión de proyectos: planificación, riesgos y control · Demo completa** con la cuenta `alumno.demo@malba.test`. Desde **Mis certificados** puedes descargar el certificado inmediatamente. En **Repasar curso** puedes descargar la guía PDF, el caso resuelto PDF, el paquete ZIP de plantillas y la lista TXT; ver los dos videos y repetir el test (70% mínimo). El resultado inicial al 100% es una simulación explícita para validar el flujo, sin validez académica. No se modifica una cuenta real ni se restablecen contraseñas existentes.

En el editor, el tipo **Test rápido** permite añadir hasta 20 preguntas, de 2 a 6 opciones por pregunta, seleccionar una respuesta correcta, redactar una explicación y definir la nota mínima. Los alumnos ven **Mis cursos**, **Mis certificados** y **Cerrar sesión**. El cambio de contraseña se mantiene únicamente en el primer ingreso obligatorio.

## Introducción y vistas previas de materiales

Cada curso puede incluir una **Introducción** configurable en Datos del curso. Se muestra como Sobre este curso; el curso de demostración también incluye introducciones educativas en cada lección. Al repasar un curso completado se abre su primera lección. Los bloques de descarga de certificados se han retirado de las lecciones y del resultado del test: los documentos se consultan desde **Mis certificados**.

Los PDF e imágenes adjuntos muestran una miniatura. Al pulsarla se abre una ventana central con la vista ampliada y un botón Descargar material. El visor de PDF propio permite recorrer las páginas sin iniciar descargas automáticas; usa `pypdfium2` y genera imágenes de página en una caché privada. Las imágenes se amplían directamente. Se mantiene la opción de abrir el original en otra pestaña. Los enlaces externos que no sean imágenes se abren con sus permisos originales.

Instala/actualiza con `py -m pip install -r requirements.txt`. Las vistas previas requieren la misma autorización que las descargas, incluso cuando la página ya está en caché. Los archivos no se envían a visores externos; la caché en `.cms-private/lms-previews/` se puede borrar y regenerar. PDFium se ejecuta bajo un bloqueo exclusivo para respetar su restricción de concurrencia entre hilos.

Ejecutar `--demo-lms` actualiza las introducciones originales del curso de prueba y añade una fotografía descargable. Conserva cuentas, contraseñas, avance, certificados y textos personalizados del administrador. El contenido publicado y el borrador se actualizan por separado.
