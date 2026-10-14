# Consultoría MALBA PMC

Se implementó la portada `/consultoria/` y las dos páginas conservando las rutas del sitio actual:

- `/consultoria-en-gestion-de-proyectos-de-transmision-electrica/`
- `/consultoria-en-gestion-de-riesgos-de-proyectos-de-transmision-electrica/`

El contenido parte de las dos capturas compartidas por el cliente, contrastadas con las páginas oficiales de las mismas rutas el 14 de octubre de 2026. Proyectos conserva siete ámbitos: planificación y control, contratos, lecciones aprendidas, acompañamiento, PMO, diseño de la planificación y causas raíz. Riesgos conserva seis ámbitos: identificación/valoración, respuestas, contingencias, acompañamiento, monitoreo y licitación. Se separaron los títulos de identificación y respuesta para evitar duplicación. Los enfoques de trabajo se adaptaron editorialmente; el alcance de cada consultoría se acuerda con el cliente. No se agregaron porcentajes, certificaciones, plazos comerciales ni garantías de resultados.

El catálogo se mantiene en `content/consultoria.json` y se genera con `scripts/build_consulting.py`, integrado al build de Academia y al servidor CMS. La edición de Consultoría no se añadió al dashboard en esta entrega. El submenú reutiliza el comportamiento existente de mouse, teclado y touch. Los enlaces anteriores a `https://malba-pmc.com/#consultoria` pasan a la nueva portada. Se añadieron migas, canonical, metadatos y datos estructurados Service/BreadcrumbList; se conserva la configuración general de indexación del entorno de prueba.

Los servicios se presentan como desplegables con una sola selección abierta. La solicitud de un servicio incorpora el tema en el mensaje sin borrar el contexto escrito por el usuario. El formulario prepara un borrador de WhatsApp al canal ya configurado en el proyecto; el visitante debe enviarlo. No crea registros en un backend, no envía correos ni confirma una solicitud recibida. Sin JavaScript, el enlace directo sigue disponible y el formulario no permite enviar accidentalmente datos por GET.

Validación: rutas públicas, menú global y móvil, contenido completo, formularios, acordeones, vista previa autenticada, exportación con HTML/CSS/JS, reserva de rutas y conservación de los flujos anteriores. Revisión visual y de desbordamientos entre 320 y 1440 px. Los recursos son WebP locales existentes; los fondos de portada, servicios y contacto son diferentes y usan capas de color MALBA sin degradados. El movimiento reducido desactiva la animación de las tarjetas.
