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
