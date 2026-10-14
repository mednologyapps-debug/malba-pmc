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

`--demo-lms` es opcional y funciona únicamente en localhost. La primera vez crea un curso claramente identificado como demostración, con dos lecciones y un alumno `alumno.demo@malba.test`. Imprime una contraseña temporal aleatoria una sola vez; el alumno debe cambiarla al ingresar. No crea usuarios ni cursos al iniciar normalmente. Si el alumno de prueba ya existe, conserva sus datos: restablece su contraseña desde el dashboard si la necesitas.

## Administrador

1. En **Cursos**, crea un curso independiente o vincúlalo a un programa de Academia para precargar nombre, presentación, portada y horas. La ficha comercial y las lecciones privadas se editan por separado.
2. El editor tiene cuatro pasos: **Datos del curso → Contenido → Certificado → Revisión**. Se puede guardar y retomar un borrador. La vista previa muestra la experiencia del alumno sin generar avance ni certificados.
3. Añade módulos y lecciones de texto, video o sesión en vivo. Cambia su orden, marca lecciones obligatorias/complementarias y adjunta recursos. Los videos admiten YouTube, Vimeo, MP4 HTTPS o archivos privados MP4. Las sesiones en vivo abren el enlace de Zoom, Meet u otro proveedor; las instrucciones y horario se colocan en el contenido.
4. Materiales privados: PDF, DOCX, XLSX, PPTX, ZIP y TXT; videos MP4, hasta 100 MB por archivo. Las portadas y firmas admiten PNG, JPG o WebP de hasta 5 MB. Para videos mayores usa un proveedor de streaming y conserva sus permisos de acceso. Los enlaces externos mantienen la privacidad configurada en el proveedor.
5. Personaliza título, texto, responsable, cargo y firma opcional del certificado. Descarga una prueba PDF identificada como vista previa.
6. Publica la edición. El servidor verifica el contenido obligatorio; guardar borrador no cambia el curso visible. Deshabilitar el curso suspende el acceso y conserva matrículas/avance. Las revisiones impiden sobrescribir una edición concurrente.
7. En **Alumnos**, crea el acceso con correo y contraseña temporal, o restablece/deshabilita una cuenta. Puedes generar una contraseña aleatoria y copiar los datos para compartirlos por tu canal habitual. No hay envío automático de correos.
8. En **Matrículas y avance**, asigna alumno/curso, configura un vencimiento opcional, suspende/reactiva accesos y revisa el porcentaje real calculado por el servidor. Puedes descargar certificados y revocarlos.

Los cambios del aula tienen sus propios botones Guardar/Publicar. No se mezclan con los borradores o el historial de la web comercial.

## Alumno

El alumno ingresa con su correo, cambia su contraseña temporal y ve únicamente sus cursos publicados con matrícula vigente. Puede buscar/filtrar, retomar la última lección, consultar videos, descargar recursos y marcar lecciones como completadas. El avance básico es una declaración explícita de finalización de cada lección; no comprueba tiempo de reproducción ni califica exámenes. La pantalla lo indica.

Completar todas las lecciones obligatorias de un curso con certificación habilita un certificado. Las complementarias no bloquean el curso. El certificado incluye el nombre del alumno, programa, horas académicas, fecha en Perú, responsable y código verificable. Se conserva una instantánea de los datos de emisión: editar el curso o perfil posteriormente no cambia un certificado ya emitido. Los certificados válidos permanecen en **Mis certificados** incluso si vence una matrícula. Para invalidar uno, el administrador usa Revocar.

La composición del certificado toma como referencia el adjunto `CertiMalba.webp`, adaptada a Academia y la marca MALBA PMC. No copia el nombre, las medallas ni los resultados del simulador de la imagen. La firma es opcional y la aporta el administrador; no se genera ni se falsifica una firma.

## Datos, seguridad y despliegue

- SQLite existente, con tablas `lms_*` separadas del contenido público. Identidades, contraseñas protegidas con hash PBKDF2, sesiones, matrículas, avance y certificados no se guardan en JSON público.
- Cookies HttpOnly, SameSite, expiración de sesión, cambio de contraseña inicial, límites de intentos y CSRF en operaciones autenticadas. En HTTPS, iniciar con `--secure-cookie` detrás del proxy.
- Materiales y MP4 en `.cms-private/lms-files/`, fuera de las rutas públicas. Cada descarga requiere sesión y autorización al curso publicado; los archivos de borradores no se exponen a alumnos. Los MP4 soportan peticiones Range para reproducción.
- La verificación pública requiere el código aleatorio del documento y muestra únicamente nombre, curso y fecha. La descarga exige sesión del titular o administrador.
- Para respaldar, detén el servidor y copia la carpeta privada completa y `assets/uploads/`. Nunca la subas a GitHub ni a un directorio público. Las portadas y firmas se guardan en la carpeta de imágenes del sitio; no uses esa carpeta para materiales privados.
- El ZIP de **Descargar web publicada** sigue siendo una exportación estática de la web y las pantallas del aula. No contiene alumnos, sesiones, matrículas, materiales privados ni el backend; no funciona como LMS en un hosting que solo sirva HTML. El LMS requiere ejecutar este backend Python con almacenamiento persistente y HTTPS. No se ha desplegado esta entrega en Hostinger ni migrado usuarios de Tutor LMS.
- No se han conectado pagos/Izipay, matriculación automática, correo transaccional, exámenes, tareas calificadas o migración de WordPress. Las matrículas de esta versión las gestiona el administrador.

## Verificación

`py -m unittest discover -s tests` ejecuta pruebas con sitio y base desechables: roles, contraseñas, CSRF, acceso por matrícula, borradores, publicación, avances, PDFs, verificación, suspensión y persistencia. La revisión de navegador cubre creación/publicación, materiales, videos, matrícula, primer ingreso, avance, reanudación y certificados, además de tamaños de 320 px a escritorio.
