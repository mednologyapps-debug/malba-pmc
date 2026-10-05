
### Academia y detalles: fondos e identidad por programa

Se eliminó el bloque introductorio del catálogo, se añadió el panel de beneficios del banner y se ordenaron los datos del programa en tarjetas dentro del hero. Los programas utilizan naranja, rojo y turquesa como acentos configurables, y fotografías con capas de color en las secciones. Se comprobó catálogo y los tres detalles a 1440, 1024, 768, 390 y 320 px: sin desbordamiento horizontal de la página, recursos faltantes ni errores JavaScript. Acordeones del temario y navegación del carrusel funcionan. Las comprobaciones de publicación validan también los colores y las rutas configurables. Capturas actualizadas de escritorio y móvil.

### Seis observaciones de navegación y diseño

Submenú con fotografías, títulos y descripciones: probado con hover, tránsito al panel, foco, Escape y botón en móvil. Se revisaron home, Academia, próximas convocatorias y los tres programas a 1440, 1131, 1024, 768, 390 y 320 px (36 combinaciones), sin desbordamiento horizontal ni errores JavaScript o recursos locales faltantes. Los detalles incluyen datos compactos, imagen del temario, competencias en tres grupos y beneficios navegables. Comprobados cambios de grupo con mouse y flechas del teclado, botones anterior/siguiente de beneficios, acordeones y morado del primer programa. Las pruebas del generador comprueban que no se pierda ninguna competencia y rechazan grupos duplicados.

### Rediseño de “Por qué MALBA PMC”

Composición de dos columnas: título y cifras a la izquierda; seis beneficios visibles en un único panel a la derecha. Se retiró la navegación por pasos. En celular el panel usa dos columnas y pasa a una columna en pantallas inferiores a 360 px. Verificados los tres detalles a 1440, 1024, 768, 390, 360 y 320 px: sin desbordamiento, textos truncados, recursos locales faltantes ni errores JavaScript. Los seis beneficios permanecen visibles con JavaScript desactivado. Las pestañas de competencias continúan funcionando. Capturas actualizadas de Dirección y Riesgos.

### Banner de inicio: fotografía y simulador

Se añadió una composición con fotografía de profesionales y captura real del simulador, reutilizando recursos WebP locales de alta resolución. Mantiene el fondo y la capa azul configurada. Revisado a 1920, 1440, 1131, 1024, 900, 768, 760, 390, 360 y 320 px: título de tres líneas, botones libres de superposiciones y sin desbordamiento de página. La composición se compacta en celular. Comprobados el cambio al banner del libro y su regreso, las diapositivas inactivas fuera del foco, los recursos locales y la preferencia de movimiento reducido. Capturas de home actualizadas.

### Banner con infraestructura 3D

La composición fotográfica fue sustituida por una ilustración 3D original con torre y subestación en colores MALBA. Los WebP de 1280 y 640 px preservan el canal alfa (rango 0–255), y el fondo se integra con la fotografía existente. Comprobados los diez anchos de la revisión anterior (320–1920 px): título de tres líneas, controles y botones sin solapamientos, cambio al libro y regreso, ausencia de desbordamiento de página y errores de recursos locales/JavaScript. La animación de entrada respeta la preferencia de movimiento reducido. Capturas de home actualizadas.

### Contraste y ensamblaje del modelo

Se retiró la fotografía del primer banner para mostrar una sola torre sobre azul MALBA sólido (#073F7C). La ilustración entra en tres capas alineadas: base, módulo central y torre, con retrasos de 0, 650 y 1300 ms. Al terminar se sustituye por la imagen completa para evitar uniones visibles. La secuencia se reproduce una vez por sesión de pestaña; recargar no la repite.

Verificados los tres estados de ensamblaje, la recarga y diez anchos entre 320 y 1920 px: sin desbordamiento horizontal, título de máximo tres líneas, fondo correcto, navegación al libro y regreso, sin recursos locales faltantes ni errores JavaScript. Con movimiento reducido o JavaScript desactivado se muestra el modelo completo. Actualizadas las capturas de escritorio y celular. `node --check home-sections.js` y `git diff --check` correctos.

### Fondo arquitectónico sutil

Imagen original de arquitectura con pocos planos, sin torres ni equipos adicionales. WebP responsive de 1536 y 800 px con capa azul uniforme al 74%, 68% al hover/foco. Revisados diez anchos de 320 a 1920 px, tres pasos del ensamblaje, sesión, navegación al libro, movimiento reducido y alternativa sin JavaScript: sin desbordamiento horizontal, recursos locales faltantes ni errores de JavaScript. Capturas actualizadas.

### Modelo ampliado y destellos

Se amplió el contenedor 3D de 430 a 470 px en escritorio y de 215 a 240 px en celular, con tamaños intermedios adaptados. Cuatro trazos luminosos suaves animan detrás del modelo mediante CSS, sin recursos adicionales. Se pausan en la diapositiva inactiva y se ocultan con movimiento reducido. Actualizada la clave de sesión a v2 para mostrar nuevamente el ensamblaje al probar esta versión. Verificados diez anchos (320–1920 px), secuencia base/módulo/torre, navegación al libro, ausencia de desbordamientos y errores; comprobada la visibilidad de los destellos y su alternativa con movimiento reducido.

### Órbita luminosa alrededor del modelo

Se sustituyeron los destellos aislados por una órbita elíptica con un haz blanco y un punto de luz que completan una vuelta cada seis segundos. Capas SVG coincidentes por delante y detrás del modelo producen profundidad; la órbita aparece al terminar el ensamblaje. Verificados movimiento real del haz, pausa en diapositiva inactiva, alternativa sin movimiento, secuencia de tres caídas y diez anchos de 320 a 1920 px, sin desbordamientos ni errores de recursos o JavaScript. Capturas actualizadas.
