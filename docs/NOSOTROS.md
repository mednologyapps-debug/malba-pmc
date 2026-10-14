# Nosotros y mejora de Consultoría

La página `/quienes-somos/` conserva la ruta del sitio anterior. Sigue la captura proporcionada y el contenido publicado en https://malba-pmc.com/quienes-somos/ (contrastado el 14 de octubre de 2026). Incluye la presentación de MALBA, su enfoque de trabajo, Miguel Alba como director académico, su trayectoria en infraestructura eléctrica y las credenciales indicadas por la empresa: PMP, RMP e ISO 31000 Risk Manager (PECB). Se mantuvo la cita de la referencia. No se inventaron cifras de clientes, proyectos entregados, fechas de fundación ni garantías de resultados.

El contenido se encuentra en `content/nosotros.json` y lo renderiza `scripts/build_about.py`. La página se incorpora al build general, a la vista previa, a la exportación y al sitemap. Nosotros aparece activo en el menú; los enlaces anteriores del home, menú, pie y diálogos apuntan a la página local. Su ruta queda reservada frente a nuevos programas. La edición de Nosotros no forma parte del dashboard en esta entrega.

Diseño: Outfit, colores MALBA, fotografías WebP locales con capas de color y una ilustración 3D ya existente, sin degradados. La foto real de Miguel Alba se presenta sin ampliarla por encima de su tamaño original; el archivo de origen publicado por MALBA conserva la misma resolución de 264 × 396 que el recurso local. En móvil se prioriza el texto del banner, las credenciales se ordenan en filas legibles y las tarjetas se convierten en una lista compacta.

La solicitud permite elegir consultoría, academia o soluciones digitales. Se prepara un borrador de WhatsApp; el visitante debe enviarlo. El saludo se adapta al contexto de Nosotros y no clasifica una solicitud de formación como consultoría. No hay envíos automáticos ni registro de leads en un backend.

La sección introductoria de ambas consultorías se reemplaza por un bloque editorial con fotografía de análisis, fondo lila, borde de marca y un acceso a los servicios. Conserva los textos y los despliega con una jerarquía visual más clara. La imagen no es un fondo decorativo que interfiera con la lectura.

Se revisaron desbordamientos entre 320 y 1440 px, jerarquía de encabezados, menú móvil/escritorio, enlaces, contacto contextual y alternativa sin JavaScript. Las pruebas de integración cubren página, metadatos AboutPage/Person, navegación local, vista previa, exportación con CSS y reserva de ruta. Se conserva la configuración de indexación del entorno de pruebas.
