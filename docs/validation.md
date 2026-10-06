# Validación de la primera entrega

Probada en Chromium headless con Playwright a anchos de 320, 390, 768, 1280 y 1440 px.

- Sin desbordamiento horizontal en los cinco tamaños.
- Logo, foto y fuentes cargan correctamente, sin respuestas HTTP 4xx/5xx locales.
- Sin excepciones JavaScript en el navegador.
- Una única etiqueta H1; JSON-LD y sitemap válidos sintácticamente.
- Menú móvil abre/cierra, estado `aria-expanded` y Escape comprobados.
- Diálogos de soluciones, soluciones digitales, publicaciones y selector de información comprobados.
- Cierre con Escape y restauración del foco al botón de menú en móvil comprobados.
- Capturas completas revisadas para escritorio, móvil y tablet; disponibles en esta carpeta.

Los destinos externos se obtuvieron de los enlaces de la portada actual. No se auditó el funcionamiento del Aula Virtual, los formularios ni las páginas externas. No se ejecutó una medición Lighthouse ni una comprobación de indexación o posiciones en Google. Esta entrega no se desplegó en producción.

## Ajuste a fondo completo

Repetidas las comprobaciones en los mismos cinco anchos: título exactamente de tres líneas, descripción de dos o tres líneas, fotografía cubriendo todo el banner y ausencia de la etiqueta eliminada. Hover cambia la capa azul de 0.76 a 0.80. Sin errores de recursos ni de JavaScript. Imagen nativa: 1672×941, versiones WebP 960×540 y 1672×941. No se generó ni se declara un archivo 4K.


## Carrusel y nuevas secciones

Comprobado en Chromium a 320, 390, 768, 1280 y 1440 px. Las dos vistas mantienen sus títulos en tres líneas; no hay desbordamiento horizontal ni recorte de contenido del libro. Flechas, puntos, flechas de teclado, Home, estado activo, inert de la vista oculta, movimiento reducido y conservación de la segunda vista al cambiar a móvil comprobados. Se confirma el orden banner → ecosistema (cuatro áreas) → programas (tres). Recursos decodificados antes de capturar; sin errores JavaScript ni respuestas 4xx/5xx locales. Capturas de portada completas y banner del libro en desktop/mobile disponibles en esta carpeta.

No se ejecutó una compra ni se alteró ningún dato o sitio de producción. El mockup del libro es una propuesta y no se verificó una portada definitiva. Swipe real en dispositivo físico no probado; el contenedor utiliza scroll-snap horizontal nativo del navegador.


## Presentación visual del libro

Comprobada en 320, 390, 768, 1440 y 1920 px: foto de fondo presente, aro y círculo discretos, título en tres líneas, sin overflow horizontal ni recorte del contenido. Animación del libro de 4500 ms y una iteración; el libro queda visible al terminar. Movimiento reducido elimina la animación. Sin errores JavaScript ni recursos HTTP fallidos. Capturas actualizadas de la segunda vista en desktop, mobile y wide.

Se conserva el commit del propietario 323855f (ajuste de styles.css). Se eliminó de home-sections.css la regla que anulaba su transparencia 0.54 en la primera vista.

## Programas, soluciones y conocimiento (5 de octubre de 2026)

- Referencias suministradas: tarjetas de programas, catálogo de cuatro soluciones y ciclo de siete etapas.
- Chromium: 320, 390, 760, 768, 1024, 1440 y 1920 px. Ajustes finales de compactación revisados otra vez en 320, 390, 760 y 1440 px.
- Tres fotografías en programas; todas las imágenes y fuentes cargan sin respuestas de error. WebP locales y carga diferida, sin imágenes enlazadas a un proveedor externo.
- Página sin desbordamiento horizontal en los siete anchos. En móvil las colecciones se desplazan dentro de su propio contenedor. Botones de avance/retroceso y estados desactivados al llegar a los extremos comprobados.
- Ver todas abre las cuatro soluciones. La navegación al detalle de RAC, cierre con Escape y cambio entre diálogos funcionan.
- Las siete etapas se seleccionan por botón y flechas. Home/End y retorno a la primera etapa comprobados. Movimiento reducido desactiva la animación de contenido; no hay autoplay.
- Video: se probó la configuración del reproductor nativo con controles, playsinline y preload none, usando una fuente configurada sólo para verificar su creación. No se probó reproducción audiovisual: falta el MP4 o enlace oficial. Sin fuente, la vista indica Próximamente y no muestra un botón de reproducción ficticio.
- Sin excepciones de JavaScript ni recursos 4xx/5xx durante el recorrido. node --check y git diff --check pasan. styles.css sigue intacto: se conserva la opacidad manual del banner.
- Capturas: programs-desktop/mobile.png, solutions-desktop/mobile.png y knowledge-desktop/mobile.png.

## Presentación editorial de Miguel Alba

Sustituye la sección de ejemplos de soluciones por texto de Miguel, foto real y tres accesos: Nuestra academia, Soluciones que ofrecemos y Publicaciones. Capturas actuales: miguel-desktop.png y miguel-mobile.png; las capturas solutions anteriores documentan una versión reemplazada.

Chromium en 320, 390, 600, 768, 900, 1024, 1440 y 1920 px: sin desbordamiento horizontal, imágenes faltantes o errores JavaScript. Foto comprobada: ancho mostrado nunca superior al ancho nativo de 264 px. Catálogo de cuatro soluciones, Escape, retorno de foco y continuidad del ciclo de conocimiento comprobados. styles.css permanece intacto; opacidad 0.54 conservada. node --check y git diff --check pasan.

## Aprende con MALBA

Sección nueva después del ciclo de conocimiento. Tres videos del canal oficial, títulos y autor verificados mediante oEmbed de YouTube. Portadas originales descargadas en alta resolución y guardadas como WebP locales. Capturas: learn-desktop.png y learn-mobile.png.

Chromium en 320, 390, 768, 1024, 1440 y 1920 px, más 844×390 en horizontal: sin desbordamiento de página ni errores JavaScript o recursos locales 4xx/5xx. Se comprobó el scroll del carrusel con flechas y teclado, popup centrado, ausencia de iframe inicial, carga de la URL del video seleccionado al abrir, bloqueo del scroll de fondo, cierre por botón/Escape/fondo, eliminación del iframe y retorno de foco. Las pruebas de estos controles usaron una respuesta de iframe de prueba para aislar la interfaz de la entrega externa. Movimiento reducido comprobado en navegación de tarjetas. node --check y git diff --check pasan.

La reproducción audiovisual real no se pudo confirmar en el navegador de este entorno: el iframe de YouTube no terminó de cargar en la comprobación externa. El usuario debe validar esa reproducción al hacer pull en su navegador. El popup incluye un enlace directo al mismo video en YouTube.

## Cierre del home: tarjetas, orden y footer

Chromium en 320, 390, 768, 1024, 1440 y 1920 px. Aprende con MALBA sigue inmediatamente a Programas destacados y sus tres tarjetas usan fondo blanco. Footer semántico único, año actual, enlaces a secciones, contacto por diálogo y retorno de foco comprobados. Banner de dos vistas, menú móvil y popup de video mantienen su funcionamiento. La prueba del iframe de video aisló la interfaz con una respuesta simulada; permanece la limitación de reproducción externa descrita arriba.

Sin desbordamiento horizontal, imágenes faltantes, excepciones JavaScript ni respuestas locales 4xx/5xx. node --check y git diff --check pasan. Capturas completas home-desktop/mobile, footer-desktop/mobile y learn-desktop/mobile actualizadas. La hoja styles.css sigue intacta.

### Iconos oficiales y fondo de Aprende con MALBA

Verificados 1920, 1440, 1024, 768, 390 y 320 px: sin desbordamiento, tarjetas blancas, enlaces sociales con nombres accesibles y recursos locales cargados. Fotografía decorativa responsive con capa azul al 90 %. Se conserva el comportamiento del popup de video, menú y carrusel. La reproducción externa de YouTube conserva la limitación de validación descrita anteriormente.

### Academia y migración de los programas

- Cinco vistas generadas: Academia, Próximos programas y tres programas existentes.
- 30 combinaciones de página y viewport (1920, 1440, 1024, 768, 390 y 320 px): un H1, Outfit, imágenes locales cargadas, sin desbordamiento horizontal de la página, sin errores de consola ni recursos locales fallidos.
- Todos los enlaces internos revisados responden 200. Navegación desde el menú del home al catálogo y desde una tarjeta al programa verificada.
- Menú Academia desplegable, cierre con Escape y retorno de foco; menú móvil y diálogo de información comprobados. El catálogo móvil tiene scroll horizontal, controles y teclado.
- Temario accesible con `details/summary`: 9 módulos en Dirección, 9 en Riesgos y 6 en PMO. El programa PMO conserva 8 sesiones; sus 6 módulos no se confundieron con el número de sesiones.
- Todos los párrafos, títulos de tarjetas y listas de los cuerpos adjuntos se mantienen. No se inventaron testimonios para sustituir el shortcode dependiente de WordPress.
- Cinco pruebas de publicación y configuración: edición de contenidos/fechas/precios, publicación de promociones vigentes, vencimiento de promociones, bloqueo de compras pausadas y escape de contenido/URLs inseguras.
- No se probó una compra real ni se enviaron consultas de WhatsApp. El formulario de brochure del plugin WordPress no estaba incluido; los botones abren los PDFs originales.
- El contenido está separado del diseño. CMS/dashboard, autenticación, API y sincronización con WooCommerce quedan para una implementación posterior.

### Refinamiento visual de Academia

Presentación agrupada, resúmenes específicos para las tarjetas, estado sobre la imagen y etiquetas independientes de duración/sesiones. CTA morado completo con flecha y alineación de precios/botones. La vista de próximas convocatorias reutiliza estos componentes.

Verificadas Academia y Próximos programas en 1920, 1440, 1024, 768, 390 y 320 px: metadatos dentro de las imágenes, sin desbordamiento de página, recursos locales cargados, botones alineados en escritorio, flechas del catálogo móvil y navegación al programa funcionales. Cinco pruebas de contenido/configuración pasan. Se ajustó la tolerancia del control al inicio del scroll para considerar el padding del carrusel. Capturas actualizadas.
