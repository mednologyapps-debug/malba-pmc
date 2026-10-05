# Contenido de Academia y contrato para el futuro CMS

`academia.json` es la fuente de las cinco páginas nuevas. El HTML publicado se genera desde estos datos: el visitante ve el contenido inmediatamente y los buscadores pueden leerlo sin ejecutar JavaScript. No se necesita Node ni un servidor de aplicaciones para probar esta versión.

## Edición y publicación actual

1. Editar `content/academia.json`.
2. Ejecutar `py scripts/build_academia.py` en Windows, o `python scripts/build_academia.py`.
3. Revisar las vistas con el servidor local habitual y publicar los archivos generados junto con los recursos.

La regeneración también sincroniza el menú y el footer del home; conserva sus secciones y su CSS.

| Área | Campos configurables |
| --- | --- |
| Portada de Academia | `academy.title`, `subtitle`, `image`, `imageSmall`, `imageAlt` |
| Presentación y catálogo | `introTitle`, `introText`, `programsTitle`, `programsText`; orden de `programs` |
| Cada programa | `title`, `category`, `description`, imágenes de tarjetas y `imageWide` para el fondo del banner, `edition`, `hours`, `sessions`, `modality`, `schedule` |
| Fechas | `startDate` en `AAAA-MM-DD`; `startLabel` para fechas sin confirmar |
| Precios | `pricing.regular`, `launch`, `currency`, `launchEndsAt`, `note`; `null` cuando no hay importe confirmado |
| Inscripciones | `status`, `registrationNote`, `checkoutUrl`, `whatsappUrl`, `brochureUrl` |
| Contenido completo | `learning`, `curriculum.modules`, `specialization`, `instructors`, `methodology`, `applied`, `outcomes`, `certificate`, `lab`, `proof`, `final` |
| Futuras convocatorias | `upcoming.title`, `description`, imágenes, presentación y `contactUrl` |

Las imágenes tienen rutas desde la raíz del sitio, sin `../`. Se recomiendan WebP y versiones responsive. La imagen alternativa describe su contenido; los fondos decorativos se publican con `alt=""`.

`launchEndsAt` usa un instante con zona horaria, por ejemplo `2027-03-01T00:00:00-05:00` para Perú. El renderizador y el navegador retiran el precio promocional al vencer. `startDate` genera la fecha visible; no hace falta escribirla de nuevo. Las estadísticas con `binding: hours`, `sessions` o `start` siguen estos datos para evitar cifras duplicadas incoherentes.

## Estados y compra

- `proximamente`: botón de inscripción deshabilitado, brochure y WhatsApp disponibles.
- `consultar`: consulta de próxima edición; no ofrece compra de una convocatoria anterior.
- `abierto`: habilita el enlace al checkout existente si `checkoutUrl` está configurado.
- `agotado`: inscripción cerrada.

El checkout y los importes de WooCommerce siguen siendo administrados en la plataforma actual. Cambiar un precio visual aquí no modifica WooCommerce: cuando se integre el dashboard debe existir una fuente compartida o una sincronización validada. No se ha creado otro sistema de pagos.

## Integración futura con dashboard.malba-pmc.com

Este cambio prepara la fuente de contenido y el renderizador; **el dashboard, la autenticación y su API todavía no están implementados**. Un flujo de publicación posterior puede guardar una revisión validada de este mismo contrato y regenerar las páginas estáticas. Esto evita añadir consultas al CMS en cada visita y conserva el HTML disponible para SEO.

El panel debe disponer de borradores, vista previa, publicación y revisiones; validar URLs/fechas/importes y gestionar imágenes. Publicar contenido debe requerir autorización en el backend. No se deben poner credenciales, claves privadas ni tokens de escritura en `academia.json` o en JavaScript del sitio.

`id` y `slug` identifican el programa. Una modificación de `slug` requiere redirección desde la URL anterior para preservar enlaces. Se mantienen los slugs originales de los tres programas existentes.

## Adaptación de los adjuntos

Se trasladaron las seis piezas de código (banner y cuerpo de cada programa) a componentes compartidos, manteniendo el texto, temarios, docentes y resultados. Se sustituyeron las fuentes externas, colores ajenos a MALBA y degradados por Outfit local y la paleta del home.

El shortcode `[malba_testimonios]` dependía de un plugin WordPress y no incluía testimonios. Se omite hasta contar con contenido real y un origen de datos. El acceso al brochure abre el PDF original; el formulario de captura del plugin no venía en los adjuntos y no se reproduce como un formulario sin backend.

Dirección conserva la fecha del 18 de agosto de 2026 como edición anterior y muestra US$ 350 de tarifa regular; la promoción de US$ 300 ya venció. Riesgos y PMO conservan el estado Próximamente. No se inventaron nuevas fechas ni precios para ellos.

Las fotografías de trabajo son ilustrativas. Miguel Alba utiliza su fotografía real, sin ampliarla por encima de la resolución de origen. Dayana Romero conserva su información sin inventar una fotografía.
