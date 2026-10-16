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
| Cada programa | `title`, `category`, `description`, `cardDescription` para el resumen del catálogo, imágenes de tarjetas y `imageWide` para el fondo del banner, `edition`, `hours`, `sessions`, `modality`, `schedule` |
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

## CMS y dashboard.malba-pmc.com

El dashboard, autenticación y API de borrador/vista previa/publicación están implementados en `dashboard/` y `scripts/cms_server.py`. Se utiliza este contrato y el mismo renderizador para generar publicaciones completas de HTML. El contenido se guarda en SQLite privada, y no se consulta al CMS desde el navegador de los visitantes. Consulta `docs/CMS.md` para iniciar el panel, probarlo y alojarlo. El subdominio público todavía requiere configurar el servidor y DNS.

El panel debe disponer de borradores, vista previa, publicación y revisiones; validar URLs/fechas/importes y gestionar imágenes. Publicar contenido debe requerir autorización en el backend. No se deben poner credenciales, claves privadas ni tokens de escritura en `academia.json` o en JavaScript del sitio.

`id` y `slug` identifican el programa. Una modificación de `slug` requiere redirección desde la URL anterior para preservar enlaces. Se mantienen los slugs originales de los tres programas existentes.

## Adaptación de los adjuntos

Se trasladaron las seis piezas de código (banner y cuerpo de cada programa) a componentes compartidos, manteniendo el texto, temarios, docentes y resultados. Se sustituyeron las fuentes externas, colores ajenos a MALBA y degradados por Outfit local y la paleta del home.

El shortcode `[malba_testimonios]` dependía de un plugin WordPress y no incluía testimonios. Se omite hasta contar con contenido real y un origen de datos. El acceso al brochure abre el PDF original; el formulario de captura del plugin no venía en los adjuntos y no se reproduce como un formulario sin backend.

Dirección conserva la fecha del 18 de agosto de 2026 como edición anterior y muestra US$ 350 de tarifa regular; la promoción de US$ 300 ya venció. Riesgos y PMO conservan el estado Próximamente. No se inventaron nuevas fechas ni precios para ellos.

Las fotografías de trabajo son ilustrativas. Miguel Alba utiliza su fotografía real, sin ampliarla por encima de la resolución de origen. Dayana Romero conserva su información sin inventar una fotografía.

### Identidad visual de los programas

`academy.features` controla los cuatro beneficios del panel del banner (título y descripción). El catálogo de Academia muestra directamente los programas, sin el antiguo bloque introductorio.

Cada programa tiene `theme.accent`, `theme.accentDark`, `theme.soft` y `theme.navy`: colores hexadecimales de seis dígitos. `accentDark` se usa en botones y texto para mantener contraste; `accent` en detalles decorativos. `sectionImage` es la ruta local de la fotografía de fondo; las capas claras u oscuras se aplican desde CSS, sin degradados. Estos campos forman parte del contenido configurable preparado para el futuro CMS.

### Navegación y competencias agrupadas

El submenú visual reutiliza `title`, `cardDescription` e `imageSmall` de cada programa. En escritorio se abre con el mouse o teclado; en móvil, con el botón de despliegue.

`curriculum.image` e `imageAlt` controlan la fotografía junto al temario. `outcomes.groups` define las tres pestañas: cada grupo tiene un `title` y una lista `items` de índices (desde cero) de las competencias existentes. El generador exige incluir todas las competencias exactamente una vez. Los beneficios de “Por qué MALBA PMC” se obtienen de `proof.items` y se muestran todos en un panel de lectura, junto al título y las cifras de `proof.stats`. El contenido completo se publica en HTML y sigue visible si JavaScript no está disponible.

### Libro en Publicaciones

La primera vista de `/publicaciones/` presenta el libro. La compra se divide en formato Físico/Digital, resumen y contacto. En escritorio se ven los tres bloques en un panel de 465 px; en celular se muestra un solo paso con Siguiente/Atrás y conserva los datos al regresar. Las revistas conservan su sección y sus PDF debajo. El resumen cambia con el formato y elimina el envío para Digital. Si el envío físico no está definido, el total se identifica como sin envío y el costo se calcula al pagar.

Dashboard → Publicaciones → Libro, compra y revistas permite configurar portada, autor, textos, temas, beneficios, muestra, moneda y los importes `physicalPrice`, `digitalPrice`, `physicalShipping`. Cada formato tiene su destino HTTPS independiente: `physicalCheckoutUrl` y `digitalCheckoutUrl`. Los precios iniciales indicados por el cliente son S/ 150 físico y S/ 80 digital. Los importes vacíos guardados se completan al migrar sin sobrescribir los valores previamente configurados. No se inventan endpoints: ambos formatos se pueden seleccionar y el botón **Continuar con el pago** valida el contacto, pero bloquea el envío cuando faltan el importe o la URL correspondiente.

El formulario entrega por POST `book_format`, `billing_full_name`, `billing_email`, `billing_country`, `billing_phone`, `receipt_type` (boleta/factura) y los campos del comprobante elegido. Boleta admite DNI opcional; Factura muestra RUC, razón social y dirección fiscal opcionales como en la referencia. Un DNI/RUC informado debe tener 8/11 dígitos. Se requiere `terms_accepted`; `marketing_consent` es opcional y desmarcado al inicio. Los campos del comprobante no elegido se deshabilitan para excluirlos del POST al endpoint elegido. No pone datos personales en la URL ni en almacenamiento del navegador. El endpoint de pago debe aceptar estos campos, crear la orden con precios y stock validados en servidor, y completar el checkout. Una URL de producto de WooCommerce no implementa este contrato por sí sola. No se ha integrado Izipay ni una API de creación de órdenes: el cobro real y la entrega digital requieren conectar ese backend. Las pruebas usan un endpoint simulado y no realizan cobros.

Los ajustes antiguos de precio y checkout se migran al formato físico cuando faltan los nuevos campos. Las revistas y revisiones guardadas se conservan. Los importes visuales deben coincidir con los cobros de la tienda.
