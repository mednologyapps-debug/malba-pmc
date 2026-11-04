# Presentación del libro · implementación y verificación

Landing: `/evento/presentacion-libro/`. Dashboard: **Eventos → Presentación del libro**.
Rama: `feature/book-presentation-event`, creada desde `staging-hostinger` (base `0d09455f308d76bbf88f9f7a3de0420a572185e4`).

## Estado de entrega

Implementados: landing responsive con recursos del catálogo, formulario único, registro transaccional, aforo/lista de espera, consentimiento versionado, pedidos separados, simulación sin tarjeta, cola SMTP, dashboard, búsqueda, filtros, estadísticas, control de ingreso, exportación XLSX y UTM sin servicios externos.

La integración financiera del repositorio consiste en URLs de checkout configurables que actualmente están vacías. No existe un adaptador Izipay verificable en este runtime. Esta implementación **no habilita cobros reales**, ni marca pagos reales desde un retorno del navegador. `simulated_paid` y `paid` son estados distintos; ningún endpoint implementado puede producir `paid`. El modo de prueba se identifica expresamente en formulario, resultado, correo y dashboard. Para activar pagos reales faltan credenciales sandbox/proveedor, implementación y pruebas del webhook/consulta verificada, conciliación por importe/moneda/referencia y aprobación explícita del propietario.

El catálogo contiene precio físico S/150, pero disponibilidad comercial deshabilitada. El evento se crea en borrador y cerrado. No se inventaron fecha, sede, capacidad ni modalidades de entrega. Antes de abrir se requieren fecha futura, sede, aforo, correo administrativo y URL HTTPS de la política de privacidad aprobada. Se verificó que `/politica-de-privacidad/` no existe en el repositorio ni en el sitio principal; por eso no se entrega un enlace roto ni se permite abrir sin configurar la política.

## Supabase

Migraciones aplicadas al proyecto MALBA `pmelyuscczjavbqhjwsr` el 4 de noviembre de 2026:

- `20261104154253_book_presentation_event.sql`
- `20261104155022_book_event_privacy_gate.sql`

Tablas dedicadas `book_events`, `book_participants`, `book_registrations`, `book_orders`, `book_mail_outbox`, `book_metrics`. RLS activa y privilegios revocados a `anon` y `authenticated`; solo el backend con service role las usa. RPC `book_register` y `book_admission`: SECURITY INVOKER, ejecución revocada a roles públicos. El bloqueo de la fila del evento serializa registro, duplicados, aforo y promociones desde espera. Pedidos y notificaciones se crean en la misma transacción.

Auditor de seguridad: sin alertas WARNING/ERROR nuevas; seis avisos INFO por RLS sin políticas son intencionales al no ofrecer acceso directo al navegador. No se modificaron tablas ni usuarios del LMS. Al terminar pruebas: cero participantes, registros y pedidos de prueba retenidos.

## Correos

Reutiliza `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`/`SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`. Identidad de remitente MALBA PMC. Correo administrativo configurable en Eventos. Sin SMTP, la inscripción persiste y las notificaciones permanecen pendientes. El dashboard permite enviar hasta 20 pendientes por acción y reintentar fallidos; repetir la acción hasta vaciar la cola.

Cada notificación tiene restricción única y reclamación condicional antes del envío. Message-ID estable por trabajo. Los jobs en `sending` después de una interrupción requieren revisar el servidor SMTP antes de reencolarlos, ya que SMTP no garantiza entrega exactamente una vez. No se reintentan automáticamente los jobs ambiguos. Los fallidos sí admiten reintento manual.

El correo de compra real solo se puede enviar si el pedido tiene `paid`; la simulación no dispara esa confirmación. El remitente SMTP real y la recepción en buzones siguen pendientes de comprobación con Hostinger. No se enviaron correos reales durante las pruebas.

## Seguridad y rendimiento

Módulo backend dentro de `event-system/`, bloqueado por el servidor estático. Sesión y CSRF del CMS reutilizados. Validación de origen para POST públicos, JSON y límite 12 KB, validación frontend/backend, honeypot, límites en memoria por conexión y correo, sanitización de búsqueda, escape HTML en emails, token firmado de pago simulado de 30 minutos. Ninguna clave en frontend. El límite por conexión permite 120 POST/minuto (600 métricas/minuto); al estar detrás del proxy puede agrupar visitantes. Para mayor escala se recomienda rate limiting distribuido con identidad de proxy verificada. Los límites en memoria se reinician al reiniciar Node.

Listados de 50 filas; exportación por lotes de 1000; indicadores mediante counts sin descargar datos personales. Métricas de cargas/clics e intentos de simulación, sin cookies ni identificación de visitantes. La conversión es orientativa, no de visitantes únicos. UTM se conservan solo con la inscripción.

## Validación

`npm run test:node` y `npm run check`: 15 pruebas Node pasan, incluidas las pruebas existentes del LMS y asistente. Cobertura nueva: validaciones, privacidad obligatoria, auth/CSRF, origen, registro RPC, duplicados, cola sin SMTP, token firmado/expirado/manipulado, simulación diferenciada, XLSX legible, correo participante/admin escapado y recursos.

Prueba SQL transaccional con rollback: inscripción gratuita, pedido de libro, lista de espera al aforo, duplicado sin segundo registro/pedido/correo, bloqueo de promoción sin capacidad, registro de ingreso, cancelación y promoción posterior. Se comprobó RLS y privilegios de las seis tablas y RPC.

Navegación con el runtime real en preview: landing escritorio y formulario; vista móvil 390 y 320 mediante iframe de QA temporal. A 390 (375 útiles por barra) y 320 (305 útiles) el ancho del documento coincide con el ancho útil y no hay desbordamiento horizontal; botones principales 70 px. Comprobada conmutación de formulario y bloqueo por evento sin configurar. Se usa Outfit local e imágenes WebP existentes. El harness de QA no forma parte de la entrega.

Pendiente: desplegar y comprobar endpoint real en Hostinger, login de dashboard, envío SMTP real y pruebas con pasarela real sandbox. El hPanel abrió en el login; requiere acceso del propietario.

## Publicación temporal

Conservar las variables actuales del runtime. Desplegar exclusivamente en `olivedrab-mouse-758184.hostingersite.com`. No modificar `main` ni `malba-pmc.com`. El contenido se sirve directamente desde Node; la ruta se registra antes del renderer de CMS para que no devuelva 404 por no pertenecer al catálogo de páginas Python. Reiniciar la aplicación Node tras actualizar el código. Confirmar `/health`, landing, login del dashboard y LMS existentes. El CLI `--port` es compatible con preview; `PORT` de Hostinger mantiene precedencia.

## Ajuste de interfaz solicitado

Botones con un solo título, aviso visible «La asistencia al evento es sin costo» y formulario «Inscríbete al evento». El libro se recoge en el lugar del evento; no hay selector de entrega y el servidor normaliza la modalidad. El administrador muestra únicamente la lista de participantes con búsqueda y paginación, diferenciando compra verificada, pendiente y simulada. Se retiraron de la interfaz configuración, indicadores, exportación y controles de asistencia/correo. Los datos del evento se completarán a partir de las indicaciones del propietario; no se asignaron fecha, sede ni aforo.

## Fecha, sede y lanzamiento confirmados

Evento: 27 de noviembre de 2026, 19:00 (America/Lima), Consejo Nacional del Colegio de Ingenieros del Perú. Libro: S/129 por lanzamiento hasta el final del 27 de noviembre, luego S/169 regular; ambos incluyen IGV. El precio efectivo se calcula en el servidor y en la transacción SQL, conservando el importe de cada pedido. SQL aplicado y reproducible: `scripts/sql/book-launch.sql`. No se abrieron inscripciones ni cobros: aforo, correo administrativo y política continúan pendientes. Verificados los importes 129/169 en una transacción SQL con rollback; 16 pruebas Node pasan.

## Recomposición y pruebas aisladas

Título con jerarquía tipográfica, fecha/hora y sede agrupadas, precio junto a la opción de compra. IGV/vigencia solo en el resumen del pedido. Se comprobó el layout en 320 y 390 px sin desbordamiento horizontal.

Pruebas: `/evento/presentacion-libro/?prueba=1`, con perfiles ficticios y pago simulado. Administrador → Eventos → Ver pruebas. Los registros de prueba viven en memoria durante dos horas o hasta reiniciar Node. No se modifican las restricciones ni el aforo de la base real. La revisión automática rechazó una propuesta inicial de habilitar pruebas en esa base; no se aplicó y se sustituyó por fixtures sin datos personales. Validación: 17 pruebas Node y ambos recorridos comprobados en navegador. Estado de credenciales: `PAYMENTS-INTEGRATION-STATUS.md`.
