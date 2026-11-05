# MALBA PMC · Izipay y CLOSE2U tras migración a malba-pmc.com

## Configuración privada en Hostinger (sin claves en GitHub)
La aplicación Node.js puede ejecutarse detrás del proxy de Hostinger; las URL externas de Izipay deben referirse siempre al dominio público.

### URL de origen
- `MALBA_PUBLIC_ORIGIN=https://malba-pmc.com` (recomendado).
- `NODE_ENV=production`.
- `IZIPAY_LIVE_ENABLED=true` (solo con credenciales PRODUCTION vigentes).
- `IZIPAY_SHOP_ID`, `IZIPAY_PROD_PASSWORD`, `IZIPAY_PROD_PUBLIC_KEY`, `IZIPAY_PROD_HMAC` — recuperarlas del panel productivo del comercio.

### Facturación electrónica
- `C2U_LIVE_ENABLED=true` (únicamente tras verificar emisión fiscal real).
- `C2U_RUC`, `C2U_USER`, `C2U_PASSWORD`, `C2U_SERIE_BOLETA`, `C2U_SERIE_FACTURA` y emisor conforme a CLOSE2U.
- Nunca emitir un comprobante por un resultado del navegador. La API solo concilia con el IPN verificado.
- Los comprobantes ambiguos se envían a revisión, no a reintento automático.

### SMTP
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_NAME` y destinatario administrativo `MALBA_CONTACT_RECIPIENT`.

## Pruebas mínimas de producción
1. Confirmar que `https://malba-pmc.com/health` responde desde Node y `https://malba-pmc.com/api/events/config` devuelve JSON.
2. Confirmar que la ruta de checkout y la IPN de producción (la configura el servidor) apuntan a `https://malba-pmc.com/api/events/payments/ipn`.
3. Confirmar sesión administrativa en dashboard; el endpoint autenticado `/api/events/admin/payments/health` debe informar `izipayProduction=true` y `realInvoices=true`.
4. Confirmar que el evento con capacidad 50, registro abierto y libro disponible muestra `paymentProvider=izipay_live`.
5. Realizar **un único pago real controlado y autorizado** y verificar IPN, estado pagado, mensaje de compra y boleta/factura en CLOSE2U/SUNAT, sin duplicaciones.
6. Verificar que el correo del participante y el correo del administrador llegan.
7. Comprobar que los pagos fallidos no generan comprobantes ni marcan pedidos pagados.

## Notas
El hecho de que el sitio funcione con un proxy no demuestra que la IPN de Izipay ni las credenciales productivas funcionen. No anunciar pagos habilitados hasta comprobar el flujo completo. Nunca pegar claves en consultas o documentos.
