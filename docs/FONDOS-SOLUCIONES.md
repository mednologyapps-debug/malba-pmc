# Fondos de Soluciones digitales

Dos fotografías ilustrativas generadas con la herramienta integrada de generación de imágenes. No documentan una oficina, instalación o participante real de MALBA. Se conservaron los originales en la carpeta de trabajo y se incorporaron al repositorio versiones WebP de 1672 y 960 px, sin ampliar su resolución original.

## Archivos

- `assets/solutions/fondo-soluciones-digitales-1672.webp`
- `assets/solutions/fondo-soluciones-digitales-960.webp`
- `assets/solutions/fondo-aprendizaje-digital-1672.webp`
- `assets/solutions/fondo-aprendizaje-digital-960.webp`

## Prompts finales (herramienta integrada)

### Tecnología y gestión de proyectos

Use case: photorealistic-natural. Asset type: a wide high resolution website background photograph for MALBA PMC digital solutions, landscape 16:9, 2048px or larger. Scene: minimal premium contemporary project engineering workspace, viewed diagonally across a large clean desk, a single thin desktop monitor on the right showing indistinct understated blue project analysis charts with no legible words, architectural infrastructure model and closed laptop subtly on desk, glass office with blurred electrical infrastructure beyond windows. Subject: digital project management and engineering technology. Composition: generous quiet negative space on left for website text; objects on right, shallow depth of field, uncluttered and understated, credible editorial photography rather than futuristic illustration. Colors: subdued MALBA navy blue #073F7C and purple #544595 with cool white and gray. Lighting: soft natural daylight, calm professional. Constraints: no text, no logo, no watermark, no people, no glowing circuitry, no neon, no floating graphics, no collage, no gradients. This is a background to sit behind a blue overlay, so keep visible physical office details and photographic texture.

### Aprendizaje digital

Use case: photorealistic-natural. Asset type: wide landscape 16:9 high-resolution subtle website section background for MALBA PMC professional project management learning and certification. Editorial photograph of a professional's hands at a clean desk reviewing a tablet and a blank notebook during a training session, navy blazer sleeve visible, minimalist modern office blurred behind, soft daylight, understated cool blue and muted purple tones with white. Composition: close view focused on hands and tablet in right half, generous quiet desk negative space left. Screen content is indistinct blue geometric chart shapes only, no readable words or numbers. Professional, credible, uncluttered, realistic textures. No logos, no text, no watermark, no visible faces, no flashy effects, no floating UI, no collage, no artificial gradients. Designed to remain elegant under a dark blue or purple website overlay.

## Integración

`content/solutions.json` contiene el mapa `backgrounds`: imagen de escritorio y de celular para cada sección. Simulator utiliza siete imágenes distintas, combinando los nuevos fondos y fotografías existentes de equipos de trabajo, infraestructura, riesgos y arquitectura, más una pantalla real del producto para los planes.

`section_photo()` en `scripts/build_solutions.py` genera las imágenes decorativas sin texto alternativo ni contenido accesible redundante. Los banners se cargan con prioridad y los fondos inferiores con carga diferida. `soluciones.css` aplica capas planas de azul, blanco y morado, sin degradados. La barra secundaria de navegación fue retirada; los botones del banner siguen llevando a la presentación y a los planes.

Para ajustar la intensidad, modifica las reglas `::before` de cada sección al final de `soluciones.css`. El valor alfa de `rgba()` aumenta la opacidad de la capa, reduciendo la presencia visual de la fotografía. Las tarjetas conservan superficies claras y el texto del banner y las secciones oscuras usa alto contraste.

## Validación

12 pruebas automatizadas del generador y del CMS. Revisión de navegador en 1440, 1131, 1024, 768, 390 y 320 px: imágenes presentes y decodificadas, fondos distintos, ausencia de la barra secundaria, ausencia de desbordamientos y errores JavaScript. Comprobación de selección de plan y renderizado del CMS.

## Ajustes de tarjetas y certificado

Las tarjetas de soluciones mantienen imágenes, subtítulos, estado visible, beneficios agrupados y botones alineados; el hover es discreto y respeta movimiento reducido. El banner ya no incluye el texto «Conocimiento aplicado. Resultados visibles.». El dashboard de Academia no muestra el bloque «Tu flujo de trabajo».

Los bloques de resultados y certificación de Simulator usan el mismo archivo original de la referencia: `assets/academia/certificado.webp`, sin alterar su contenido ni recortarlo. Se eliminó la representación del certificado en HTML.

Imagen específica para MALBA Risk: `assets/solutions/riesgos-proyecto-1100.webp` y `assets/solutions/riesgos-proyecto-600.webp`. Generada con la habilidad imagegen y la herramienta integrada. Prompt: fotografía editorial de manos de un gestor evaluando una matriz de riesgos sobre una mesa de ingeniería; marcadores de prioridades, planos eléctricos sutiles, azul #003B73, morado #5D4594 y grises; luz natural, composición limpia, sin texto, logos, degradados ni interfaces inventadas. Usada en tarjetas, menú y ficha de MALBA Risk.

### Isotipo de Simulator y resultados

`assets/solutions/simulator-isotipo.jpg` es una copia exacta del JPG adjuntado por el cliente. El naranja #F28D01 se obtuvo del color más frecuente del isotipo; se utiliza en el estado y botón de la tarjeta, con texto oscuro para conservar legibilidad. La sección «Tus decisiones tienen consecuencias» utiliza la captura real `assets/solutions/simulador-1100.webp`, que muestra costos, cronograma y desempeño. El certificado original se conserva únicamente en certificación.
