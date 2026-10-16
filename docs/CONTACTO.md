# Contacto rápido del encabezado

El encabezado conserva un solo botón **Contacto**, que ocupa el lugar de Solicitar información. Se retiró el enlace duplicado del menú. Aula virtual conserva su destino y aparece en la portada y en el desplegable de Academia, sin icono.

El diálogo compartido de `templates/dialogs.html` presenta tres campos obligatorios: nombre, correo y consulta. `app.js` valida entradas vacías, espacios y formato de correo y prepara un borrador de WhatsApp con los datos. El visitante debe enviarlo. El canal usa el contacto de Consultoría del CMS (inicialmente `contactUrl` de `content/consultoria.json`). No se envían correos ni se almacenan datos en un backend o en el navegador.

El home se sincroniza con la plantilla al generar las páginas, por lo que su contacto no queda con un diseño anterior. Los botones de contacto ya existentes en el pie y otras secciones abren el mismo diálogo. El diálogo nativo gestiona el foco; Escape, el cierre y el clic fuera permiten salir. El fondo no se desplaza mientras hay un popup abierto. En móvil, al cerrar se devuelve el foco al control del menú.

Sin JavaScript, el formulario queda deshabilitado para evitar enviar accidentalmente datos y ofrece un enlace directo alternativo dentro del bloque noscript. Los estilos usan exclusivamente la paleta MALBA y no añaden degradados ni iconos al Aula virtual.

Se comprobaron encabezado y formulario únicos en home y páginas internas, validación, apertura/cierre, foco, navegación móvil, ausencia de desbordamientos entre 320 y 1440 px y borrador de WhatsApp mediante un destino simulado, sin envío de mensajes reales.
