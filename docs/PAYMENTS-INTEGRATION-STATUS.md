# Izipay y CLOSE2U · 4 de noviembre de 2026

Rama: `staging-hostinger`. Despliegue exclusivo en el dominio temporal de Hostinger.

## Configuración recuperada

Izipay vigente: WooCommerce / Micuentaweb, no las constantes históricas de wp-config. Se trasladaron únicamente comercio y credenciales TEST a variables privadas de la aplicación Node. No se publican claves en código ni documentación.

CLOSE2U vigente: opción privada `malba_c2u_settings`. Conexión del WordPress verificada; configuración trasladada a variables privadas de Node: emisor, usuario, clave, series y medio de pago. Integración ERP, precios con IGV incluido, venta interna y operación gravada. El WordPress principal no fue modificado.

`IZIPAY_LIVE_ENABLED=false` y `C2U_LIVE_ENABLED=false`. No se habilitan cargos ni emisión fiscal reales.

## Implementación

CreatePayment en servidor con importe PEN calculado por el evento. Formulario oficial Izipay. Retorno del navegador autenticado para mostrar estado; solo IPN firmado con contraseña privada puede conciliar. Se comprueban comercio, modo, referencia, importe, moneda y transacción. RPC con bloqueo de fila y deduplicación. Sesiones privadas con token firmado de 30 minutos; sin claves privadas en el navegador.

CLOSE2U: autenticación con token reutilizable, validación de datos de boleta/factura y vista previa OFFLINE con número cero. La emisión ERP real requiere pago PRODUCTION verificado y bandera explícita; cola privada, reclamación condicional y revisión manual de respuestas ambiguas. Nunca se reintenta automáticamente una emisión ambigua.

## Pruebas

Abrir `/evento/presentacion-libro/?prueba=1`. Solo perfiles sintéticos. Con Izipay configurado, la opción de compra abre el formulario TEST del proveedor. Tras IPN verificado se ofrece vista previa de boleta en CLOSE2U; no se emite a SUNAT. Las sesiones de pasarela son duraderas; los registros sintéticos de participantes viven en memoria hasta dos horas o reinicio y se muestran en Eventos → Ver pruebas.

El registro público real continúa cerrado: faltan aforo, correo administrativo y política de privacidad aprobada. No se eliminaron esos requisitos. La apertura previa fue rechazada por revisión automática y se sustituyó por pruebas aisladas.

## Resultado verificado en Hostinger

26 pruebas Node pasan. Se ejecutó un pago con tarjeta oficial de prueba de Izipay: S/129, moneda PEN, modo TEST. Izipay notificó al servidor y la sesión quedó `paid` con transacción verificada. El navegador mostró «Pago confirmado»; el retorno por sí solo no cambia el estado.

CLOSE2U autenticó en `https://tefacturo.pe`, el endpoint usado por el plugin operativo de WordPress. La dirección `jarvis.tefacturo.pe` de la documentación actual rechazó las credenciales de esta cuenta; por eso se conserva el host vigente. Se descargó y examinó una vista previa BBV1-0: base S/109.32, IGV S/19.68, total S/129.00. Se usó exclusivamente `/preview-api/boleta/`; no se llamó a emisión fiscal. Ningún trabajo de factura fue generado para el pago TEST.

Las claves REST enmascaradas en el formulario de WordPress no se usan como credenciales; se recuperó la opción vigente autorizada y se trasladaron las claves TEST válidas sin guardarlas en el repositorio. Se corrigieron el modo dentro de `orderDetails`, el UUID compacto de Izipay y el render duplicado del formulario durante la prueba externa.

SQL verificado con rollback: importe incorrecto rechazado, conciliación correcta, repetición idempotente y cero facturas para TEST. Tablas privadas con RLS y sin privilegios públicos. No hay avisos de seguridad nuevos: los avisos INFO por RLS sin políticas son intencionales para acceso exclusivo de servidor; la advertencia global de contraseñas filtradas de Supabase Auth es previa a este cambio.

Código funcional desplegado: `9ab8f555`. La actualización posterior de esta documentación y tests no cambia el runtime.
