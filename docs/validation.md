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
