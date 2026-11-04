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

Validación automatizada: 25 pruebas Node pasan. La comprobación externa del formulario, IPN y PDF se documentará tras el despliegue; no debe confundirse configuración recuperada con flujo completo verificado.
