# Elemento 3D del banner MALBA

Generado con la herramienta integrada `image_gen` (modo built-in), como recurso original para el banner del home.

Archivos publicados: `assets/hero/infraestructura-3d-1280.webp` (1280 × 1170) y `assets/hero/infraestructura-3d-640.webp` (640 × 585). Ambos conservan transparencia real. El banner selecciona la versión pequeña en celular.

## Prompt utilizado

Use case: stylized-concept. Asset type: premium 3D transparent cutout for the right side of MALBA PMC electrical project management consulting homepage hero. Create a striking, sophisticated architectural scale model: a single tall electrical transmission lattice tower and a compact electrical substation with two transformers and porcelain insulators, on a clean low beveled square plinth viewed in three-quarter isometric perspective. Tower dominates with elegant detailed structural bracing, strong silhouette and realistic engineering proportions. Short clean power lines terminate within the composition, nothing cut off. Luxury architectural visualization, polished precision manufactured surfaces, physically realistic 3D, contemporary professional corporate aesthetic, dramatic yet tasteful studio lighting. Strict palette of deep MALBA blue #003B73 and royal purple #5D4594, white porcelain and subtle pale silver-blue highlights. Tower predominantly bright satin white-silver with blue accents so it reads clearly against dark blue website photography. Base deep blue with purple edge accents. One cohesive model, centered, entire object visible with comfortable transparent margin. Real transparent alpha background, no environment, no rectangular backdrop, no sky, no text, no logo, no people, no charts, no UI panels, no gradients as decorative backgrounds, no neon glow, no cartoon toys, no cables extending out of frame. High detail clean edges and premium photorealistic material rendering.

## Fondo y entrada por partes

El primer banner utiliza azul sólido #073F7C, sin fotografía de torres detrás. La animación reutiliza la misma ilustración mediante tres capas recortadas con CSS: base, módulo central y torre. No requiere un motor 3D ni recursos adicionales. Al terminar muestra una sola imagen completa.

`home-sections.js` registra la entrada con `sessionStorage` bajo `malba-hero-assembly-v2`. Se reproduce una vez por sesión de pestaña y respeta `prefers-reduced-motion`. Sin JavaScript, almacenamiento o animación, la alternativa es la ilustración completa.
