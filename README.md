# MALBA PMC — menú y banner, v1

Primera entrega de la reconstrucción. El repositorio original solo contenía este README, sin el código de Hostinger.

## Probar

No requiere npm ni compilación. Desde la carpeta del repositorio:

```sh
python -m http.server 8080
```

Abrir http://localhost:8080. También se puede abrir `index.html` directamente para revisar el diseño. En Windows, si `python` no funciona, utilizar `py -m http.server 8080`.

## Alcance

- Menú sticky, navegación móvil, estados de foco y cierre con Escape.
- Banner responsive, título HTML real y dos acciones.
- Logo original, Outfit alojada localmente y colores dominantes del logo: azul `#073F7C`, morado `#544595`, más blanco y transparencias de estos colores. Sin degradados.
- Fotografía ilustrativa generada para esta entrega, no representa un proyecto de un cliente. WebP a 640, 960 y 1536 px con `srcset`.
- Sin framework, APIs, dependencias de producción, analítica, cookies ni solicitudes de fuentes externas.

## Botones y enlaces

Inicio vuelve a la portada. Consultoría, Academy, Nosotros y Aula virtual enlazan a los destinos extraídos del HTML de la web actual:

- https://malba-pmc.com/#consultoria
- https://malba-pmc.com/proximos-cursos
- https://malba-pmc.com/quienes-somos
- https://malba-pmc.com/escritorio

Soluciones digitales y Publicaciones abren vistas informativas provisionales basadas en la referencia. No son páginas de catálogo ni ofrecen compra. Explorar soluciones abre un selector de consultoría y soluciones digitales. Contacto y Solicitar información abren un selector de programas/consultoría de la web actual: **todavía no capturan ni envían consultas**. No se inventaron correo ni teléfono. Al construir esas secciones, reemplazar estos botones por enlaces a las páginas definitivas y conectar el contacto al canal que confirme el propietario.

## SEO preparado

HTML estático, una etiqueta H1, title, description, canonical, Open Graph, datos JSON-LD Organization/WebSite, favicon, dimensiones de imágenes, carga prioritaria de la imagen principal, sitemap y robots. Los metadatos usan el dominio previsto https://malba-pmc.com/. No se añadieron valoraciones, certificaciones ni métricas sin verificación.

**Esta primera vista usa `noindex, follow`** para evitar que se indexe como web final. Cuando toda la web esté lista, retirar la etiqueta noindex, confirmar el dominio canónico y los recursos de Open Graph, ampliar el sitemap con las páginas reales, preservar/redireccionar las URLs actuales y enviar el sitemap a Search Console. No sustituir la web de producción con esta entrega parcial. La posición en Google no está garantizada por el código.

## Hostinger

Para revisión, subir `index.html`, `styles.css`, `app.js` y `assets/` a una carpeta o subdominio de pruebas. Mantener la web actual y su WordPress intactos. No copiar reglas de reescritura ni reemplazar el `.htaccess` actual. `robots.txt` y `sitemap.xml` están preparados para el futuro lanzamiento en la raíz del dominio, no para sobrescribir los del sitio actual en esta etapa.

## Imagen y tipografía

Prompt de la imagen: fotografía editorial realista de torres de transmisión eléctrica entre montañas de Perú, torre principal a la derecha, iluminación diurna suave, colores fríos azul y morado, metal nítido, sin personas, texto, logos ni elementos de interfaz. Generada con la herramienta integrada de imágenes, optimizada en WebP sin aumentar artificialmente su resolución. La imagen original suministrada del logo conserva sus proporciones. Outfit distribuida bajo SIL Open Font License; licencia en `assets/fonts/OFL.txt`.

## Validación

Revisado en Chromium en 320, 390, 768, 1280 y 1440 px: sin scroll horizontal, recursos faltantes ni excepciones JavaScript. Menú, diálogos, Escape y retorno de foco comprobados. Capturas y alcance de validación en `docs/`.
