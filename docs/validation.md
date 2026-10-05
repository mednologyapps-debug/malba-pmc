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
