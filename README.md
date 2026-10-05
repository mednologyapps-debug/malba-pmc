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
- Fotografía ilustrativa generada para esta entrega, no representa un proyecto de un cliente. Banner panorámico con WebP a 960 y 1672 px con `srcset`, sin ampliación artificial de la imagen nativa.
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

Para revisión, subir `index.html`, `styles.css`, `home-sections.css`, `app.js`, `home-sections.js` y `assets/` a una carpeta o subdominio de pruebas. Mantener la web actual y su WordPress intactos. No copiar reglas de reescritura ni reemplazar el `.htaccess` actual. `robots.txt` y `sitemap.xml` están preparados para el futuro lanzamiento en la raíz del dominio, no para sobrescribir los del sitio actual en esta etapa.

## Imagen y tipografía

Prompt de la imagen actual: fotografía editorial panorámica de torres de transmisión eléctrica entre montañas de Perú, torre principal en el tercio derecho, mitad izquierda despejada para el texto, iluminación diurna suave, colores fríos azul y morado, metal nítido, sin personas, texto, logos ni elementos de interfaz. Se solicitó 3840×2160; la herramienta entregó 1672×941 y se conserva esa resolución nativa, sin hacerla pasar por 4K. Generada con la herramienta integrada de imágenes, optimizada en WebP sin aumentar artificialmente su resolución. La imagen original suministrada del logo conserva sus proporciones. Outfit distribuida bajo SIL Open Font License; licencia en `assets/fonts/OFL.txt`.

## Validación

Revisado en Chromium en 320, 390, 768, 1280 y 1440 px: sin scroll horizontal, recursos faltantes ni excepciones JavaScript. Menú, diálogos, Escape y retorno de foco comprobados. Capturas y alcance de validación en `docs/`.

## Ajuste del banner

Foto de fondo en toda la sección, sin panel azul separado ni etiqueta sobre la imagen. Capa azul uniforme con opacidad 0.76, que pasa a 0.80 en hover con mouse y foco de teclado. El contenido permanece visible en pantallas táctiles. Título abreviado en tres líneas: “Conocimiento que / transforma proyectos / eléctricos.” La descripción mantiene “infraestructura eléctrica”. Capturas actualizadas en `docs/`.


## Portada: carrusel, ecosistema y programas

Orden actual: banner con dos vistas (presentación de MALBA y libro), Nuestro ecosistema y Programas destacados. El carrusel empieza en MALBA y cambia por flechas, puntos, teclado, deslizamiento táctil o scroll horizontal del trackpad. No avanza automáticamente ni intercepta el scroll vertical de la página. Ajusta la altura al contenido de cada vista y desactiva los enlaces de la vista que no está visible. Respeta la preferencia de movimiento reducido.

El ecosistema contiene Consultoría, Academy, Soluciones digitales y Publicaciones. Los tres programas son Dirección de Proyectos de Transmisión Eléctrica, Gestión de Riesgos en Proyectos de Transmisión Eléctrica y Diseño, Implementación y Mejora de PMO. Enlaces de programas, libro y compra llevan al sitio actual; no se creó un checkout nuevo. No se publicaron precios ni fechas de cohortes.

`home-sections.css` y `home-sections.js` contienen estas nuevas secciones. `styles.css` no se modifica en esta entrega para respetar los ajustes locales hechos por el propietario. La opacidad del primer banner se controla directamente en `styles.css`; se retiraron las reglas de `home-sections.css` que anulaban el ajuste manual del propietario (0.54).

La imagen de libro que publica hoy el sitio dice MOCKUP. Por eso la nueva imagen 3D es una **propuesta de portada**, no la cubierta oficial de una edición. Debe sustituirse por la cubierta aprobada antes del lanzamiento. Título y autor contrastados en https://malba-pmc.com/libro/. Compra: https://malba-pmc.com/producto/gestion-de-proyectos-1ra-edicion/. Fuentes de los programas: páginas actuales del sitio enlazadas en cada tarjeta.

Mockup creado con la herramienta integrada de imágenes a partir del logo suministrado. Prompt: libro de tapa dura aislado con transparencia, vista en tres cuartos mostrando portada y borde de páginas, azul #073F7C, lomo morado #544595, texto blanco, título GESTIÓN DE PROYECTOS DE TRANSMISIÓN, subtítulo FACTORES CLAVE, autor MIGUEL ALBA, detalle de torres en azul, sin etiquetas ni degradados impresos. Original generado: 1374×1145; archivos de proyecto `assets/book/libro-3d-600.webp` y `assets/book/libro-3d-960.webp`, conservando transparencia y proporción.

Referencia adicional revisada: https://lilianabuchtik.com/, especialmente la presentación de servicios y libros en distintas vistas del banner. Se mantiene el branding propio de MALBA.


## Presentación visual del libro

La segunda vista añade un fondo de infraestructura eléctrica con opacidad 0.23, un círculo morado y un aro fino detrás del libro, y un mockup más grande. No hay degradados ni nuevos recursos externos. El libro entra con una oscilación suave de 4.5 segundos, una sola vez por entrada a esa vista; el texto aparece en 0.65 segundos. No hay movimiento continuo. Todo el movimiento se desactiva con `prefers-reduced-motion`.
