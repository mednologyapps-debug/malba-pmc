# CMS de MALBA PMC

Panel funcional para Academia, sus programas y Publicaciones, con el diseño MALBA y Outfit local. Backend Python 3.10 o superior, sin dependencias de producción externas. Base SQLite privada; publicación del HTML en una transacción, sin consultas del navegador al CMS al visitar Academia.

## Probar en Windows / VS Code

Desde la carpeta del proyecto, detén el servidor `py -m http.server 8080` con Ctrl+C. Luego:

```powershell
git pull origin feature/menu-banner-v1
py scripts/cms_server.py
```

La primera ejecución solicita un usuario (por defecto `admin`) y una contraseña de 12 a 256 caracteres, repetida para confirmar. La contraseña no aparece al escribir. No hay cuenta ni contraseña preconfiguradas. Python guarda el hash con PBKDF2-SHA256 y sal aleatoria.

- Panel: http://localhost:8080/dashboard/
- Web publicada de prueba: http://localhost:8080/
- Academia: http://localhost:8080/academia/

En macOS/Linux, usa `python3 scripts/cms_server.py`. Para usar otro puerto: `--port 8081`.

El servidor está limitado a tu equipo por defecto. No uses el servidor estático anterior para probar el CMS: no dispone de su API.

## Flujo de edición

1. Selecciona **Academia** en el menú lateral. El centro muestra los accesos a Portada y catálogo, Próximas convocatorias y la lista visual de programas. Pulsa una tarjeta para abrir su editor; **Academia / Programas** regresa al catálogo. Publicaciones también está habilitada. Las demás áreas del menú están preparadas para próximas etapas y permanecen deshabilitadas.
2. Edita textos, imágenes, colores, contenidos, duración, fechas, inscripción, precios y enlaces. El editor del programa muestra seis pestañas: General, Imágenes, Inscripciones, Contenido, Docentes y método, y Cierre. Dentro de cada pestaña hay grupos desplegables. Cambiar de pestaña conserva los cambios. Puedes reordenar y añadir elementos.
3. **Guardar borrador** conserva el trabajo de forma privada, incluso al reiniciar el servidor. No cambia la web.
4. **Vista previa** abre el programa seleccionado (o el catálogo cuando estás en la vista general), incluidos los cambios aún sin guardar, en otra pestaña. Requiere la sesión del editor y vence después de 30 minutos.
5. **Publicar edición** muestra un resumen de confirmación y actualiza la web servida por este backend. El historial conserva hasta 30 publicaciones.
6. **Historial** permite recuperar una publicación como borrador. Conserva los programas añadidos después como deshabilitados; si estaban en la papelera, permanecen en ella.
7. **Crear programa** abre un asistente de cinco pasos: Datos → Imágenes → Inscripciones → Contenido → Revisión. El identificador se genera automáticamente y la URL se propone a partir del nombre. Puedes elegir una plantilla y volver a pasos anteriores sin perder lo escrito. Valida los campos y confirma la revisión antes de **Crear y guardar borrador**. La creación guarda automáticamente el programa como deshabilitado, con precios y enlaces de compra vacíos. Revisa los textos heredados de la plantilla; después habilita el programa y publica cuando esté listo.

El catálogo incluye búsqueda por nombre/categoría y filtros Todos, Visibles, Deshabilitados y Papelera. Las tarjetas tienen acciones Editar, Deshabilitar/Habilitar y Eliminar.

- **Deshabilitar** conserva el contenido en el CMS, oculta el programa del catálogo, menú, destacados y sitemap, y sustituye su página por una vista de no disponibilidad sin inscripción. La vista previa privada del editor permite revisar la página completa mientras está deshabilitado.
- **Eliminar** envía el programa a la papelera. Su ruta deja de estar disponible inmediatamente en la web de prueba (404); no se elimina físicamente el registro ni sus imágenes. Puedes **Restaurar** desde la papelera y volverá como deshabilitado. Los nombres de URL se conservan para evitar reutilizar accidentalmente enlaces antiguos.
- Estas operaciones guardan el borrador y aplican solo la visibilidad del registro a la última versión publicada, de inmediato en la web de prueba. No publican otros cambios de textos, precios o imágenes. Habilitar contenido que nunca se ha publicado requiere Publicar edición. Recuperar una publicación previa también puede restaurar una versión anterior de un programa.

El estado de inscripción (Próximamente, Inscripciones abiertas, etc.) es independiente de la visibilidad. Un programa puede estar visible sin aceptar compras. Máximo 30 programas fuera de la papelera y 150 registros en total, incluida la papelera.

PNG/JPG/WebP hasta 5 MB por imagen. No admite SVG. Las imágenes quedan en `assets/uploads/`. Se pueden utilizar enlaces HTTPS. No se amplían ni comprimen automáticamente los archivos subidos: conviene preparar imágenes WebP adecuadas para escritorio/celular.

Los precios modifican el contenido visible en esta web. **No cambian los productos ni los cobros de WooCommerce/Izipay.** El panel lo indica junto a los precios y antes de publicar. Los enlaces de inscripción existentes se mantienen.

## Persistencia y copias de seguridad

La base de datos, usuarios, sesiones, borradores, publicaciones y vistas previas se almacenan en `.cms-private/cms.sqlite3`. Las rutas privadas, scripts y archivos de código no se sirven por HTTP. La carpeta de estado y las imágenes subidas están excluidas de Git; las contraseñas no se suben al repositorio.

Realiza copias de `.cms-private/` y `assets/uploads/` con el servidor detenido. Actualizar los archivos del repositorio conserva el contenido guardado en la base. Al reiniciar, la publicación actual se vuelve a renderizar con las nuevas plantillas y rutas conservando los datos. La actualización agrega Publicaciones y reconcilia programas deshabilitados o en la papelera que se habían guardado con la versión anterior, sin publicar otros cambios pendientes. Para recuperar una contraseña, ejecuta `py scripts/cms_server.py --reset-admin` con el servidor detenido; crea nuevamente el usuario y su contraseña e invalida las sesiones anteriores.

**Descargar web publicada** exporta un ZIP de la publicación activa con HTML, contenido JSON de programas visibles, CSS, JavaScript e imágenes; no incluye el dashboard, la base de datos ni credenciales. Sirve para subir la web estática a una carpeta de pruebas de Hostinger. Los cambios posteriores en el CMS requieren exportar/subir otra vez si la web se aloja de esta manera.

## Alojamiento del subdominio

Esta entrega no configura DNS ni cambia la web de producción. No se ha desplegado una URL pública de `dashboard.malba-pmc.com` porque no hay acceso a Hostinger en la sesión.

El backend requiere un entorno capaz de ejecutar procesos Python persistentes, como un VPS. Un hosting que solo sirve PHP/HTML no puede ejecutar este servidor mediante la subida de archivos. En ese caso, puede alojar el ZIP público exportado, pero el panel debe ejecutarse en un servidor compatible.

Para publicar CMS y web juntos en un servidor compatible:

- Usa un servicio de sistema para mantener el proceso y un proxy HTTPS delante de él.
- Ejecuta `python3 scripts/cms_server.py --host 127.0.0.1 --port 8080 --state-dir /ruta/privada/malba-cms --secure-cookie`.
- El proxy debe conservar `Host`, terminar HTTPS y pasar al proceso solo las peticiones de los dominios configurados. `--secure-cookie` marca las cookies para HTTPS; no debe activarse en la prueba HTTP local.
- Para servir el panel en `dashboard.malba-pmc.com`, enruta `/` a `/dashboard/` dentro de ese dominio, y comparte el mismo backend para `/api/`, `/assets/` y `/cms-preview/`. Los previews incluyen rutas de Academia; el proxy debe conservarlas. La web pública usa las rutas normales del mismo backend y de la misma publicación.
- Mantén la base en un directorio privado con permisos restringidos. El servidor Python no expone sus archivos.
- Configura copias de seguridad, renovación TLS y límites de peticiones/cargas en el proxy.

## Alcance

Implementados login/logout, expiración de sesiones, control de intentos de acceso, comprobación de origen/CSRF, borradores con control de edición concurrente, editor completo de Academia/programas, imágenes, creación/orden de programas, vistas previas privadas, publicación, historial y exportación.

El home conserva su contenido visual; el generador sincroniza sus enlaces de navegación y footer con los programas. Este panel todavía no edita banners, soluciones o videos del home, no administra usuarios/alumnos y no sincroniza pagos ni el aula virtual.

## Validación

`python -m unittest discover -s tests -v`: 17 pruebas automatizadas, incluidas integración HTTP sobre un sitio y base desechables. Verifican control de acceso, CSRF/origen, rutas privadas y traversal, borrador/vista previa/publicación, conflictos, persistencia, recuperación, exportación, carga de imágenes y creación de programa.

Prueba de navegador: navegación por áreas y catálogo central del CMS, edición, recarga del borrador, vista previa, publicación, subida de imagen, historial, creación y cierre de sesión. Web pública revisada a 1440, 1131, 1024, 768, 390 y 320 px; CMS a 1440, 1024, 768, 390 y 320 px. Sin desbordamientos, errores JavaScript ni recursos locales faltantes. Verificados hover y navegación táctil de los dos submenús, cierre con Escape, enlaces de tarjetas, los tres planes, cantidades de licencias, regreso del foco y contenido de la solicitud de WhatsApp.

## Soluciones digitales

- Catálogo: http://localhost:8080/soluciones-digitales/
- MALBA Simulator: http://localhost:8080/soluciones-digitales/simulador-de-gestion-de-proyectos/
- MALBA Risk: http://localhost:8080/soluciones-digitales/malba-risk/ (próximamente).

El menú superior incorpora un submenú con imagen, título y descripción. El catálogo y las fichas se generan desde `content/solutions.json` y `scripts/build_solutions.py`, con estilos en `soluciones.css`. El dashboard edita Academia y Publicaciones; Soluciones digitales permanece pendiente en el panel.

La ficha de Simulator sigue la referencia SaaS: presentación, pasos, resultados, certificación y planes Individual/Universitario/Empresarial. Los precios y el video definitivo están pendientes. La selección de plan/licencias prepara una solicitud de acceso por WhatsApp; no cobra ni activa licencias. La pantalla del producto reutiliza imágenes reales del proyecto. El certificado utiliza la misma imagen original de MALBA Simulator incorporada en la referencia. Esta entrega implementa las páginas comerciales, sin cambiar el motor del simulador ni crear un sistema de pagos o alumnos.

### Validación del admin guiado

Probado el recorrido de los cinco pasos con campos obligatorios, URL automática, subida de imagen y guardado del programa; recarga del borrador, búsqueda y pestañas. Vista previa completa de un programa deshabilitado, habilitación y publicación, deshabilitación con inscripción retirada, eliminación con ruta 404 y restauración desde papelera. Revisión de catálogo, seis pestañas y asistente a 1440, 1024, 768, 390 y 320 px sin desbordamientos. La edición de competencias mantiene su correspondencia con las pestañas al añadir, quitar o reordenar elementos.

## Publicaciones

- Landing: http://localhost:8080/publicaciones/
- Panel: Publicaciones en el menú lateral.

Siete ediciones de Gestiona Proyectos con sus PDFs originales, sin recomprimir ni modificar. Portadas extraídas de la primera página en WebP de 480/960 px. Se abre el PDF en otra pestaña; el navegador elige su visor nativo o la descarga. No se descarga ningún PDF al cargar el catálogo.

Desde el panel puedes editar el banner y el catálogo, buscar, añadir, reordenar, editar texto/edición/páginas, cambiar portada y archivo, deshabilitar, enviar a papelera y restaurar. Los registros nuevos se guardan deshabilitados. La visibilidad de una revista publicada se aplica inmediatamente; los cambios de contenido se revisan y publican con el flujo habitual. Los PDFs admiten hasta 20 MB, imágenes hasta 5 MB. Las URLs externas deben ser HTTPS. La visibilidad retira enlaces del catálogo; no convierte un PDF público en un documento privado ni borra archivos existentes.

Los metadatos iniciales están en `content/publicaciones.json`. El estado editable vive en la misma base privada del CMS, bajo `publications`, y las páginas se renderizan desde el mismo snapshot que Academia. Las actualizaciones conservan ediciones del cliente; recuperar un historial mantiene registros posteriores deshabilitados o en papelera. El ZIP incluye la landing, CSS, portadas y archivos PDF, sin cuentas ni base de datos.

Fondo editorial: `assets/publications/fondo-editorial-1536.webp` y variante de 960 px, generado con la habilidad imagegen y la herramienta integrada. Prompt: escritorio editorial profesional con revistas de gestión de proyectos, publicación abierta y planos sutiles; luz natural, azul MALBA, morado discreto y blancos; espacio negativo; sin texto, logos ni degradados. La capa azul se aplica en CSS.

Verificados en navegador los siete PDFs, carga/alta de revista, publicación, eliminación y restauración, aislamiento de cambios pendientes al retirar un programa, y páginas públicas/admin a 1440, 1024, 768, 390 y 320 px. Las 17 pruebas incluyen migración de papelera anterior, visibilidad inmediata, exportación editorial y carga de PDF.
