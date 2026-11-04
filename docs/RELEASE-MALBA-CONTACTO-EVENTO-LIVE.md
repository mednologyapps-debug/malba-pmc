# MALBA PMC · Checklist para pasar a producción (4 noviembre 2026)

## Alcance
Cambios preparados en `fix/contact-email-event-production-readiness`: formularios de contacto y consultoría por SMTP; asistente con WhatsApp directo y saludo autooculto; programas con próxima edición; soluciones digitales sin licencia; formulario del evento sin empresa/cargo y con boleta/factura; recogida compacta; panel de configuración del evento; Izipay LIVE bajo bloqueo por credenciales y CLOSE2U.

## Antes de abrir la inscripción real
- Comprobar `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (o `SMTP_PASS`), `SMTP_FROM`; configurar `MALBA_CONTACT_RECIPIENT` si el destinatario administrativo difiere del buzón SMTP.
- En Dashboard → Eventos, configurar fecha/hora correctas, sede, **aforo**, **correo administrativo**, y URL HTTPS de una política de privacidad válida. Solo entonces publicar y activar inscripciones; el servidor rechazará la apertura si faltan requisitos.
- Revisar precio vigente del libro, fecha de vencimiento promocional y recojo presencial. Configurar libro disponible solo si se confirma stock y entrega.
- Validar una inscripción con correo real en bandeja del visitante y del administrador; comprobar cola SMTP.
- Las páginas de Academia y Soluciones Digitales son informativas; no deben anunciar ventas ni enlaces externos de pago.

## Activación real de Izipay y facturador
Las pruebas en Izipay TEST y CLOSE2U preview documentadas en `PAYMENTS-INTEGRATION-STATUS.md` **no equivalen a una prueba LIVE**.

Para la activación LIVE, exclusivamente en la configuración privada de Hostinger:
- `IZIPAY_LIVE_ENABLED=true`, `IZIPAY_SHOP_ID`, `IZIPAY_PROD_PASSWORD`, `IZIPAY_PROD_PUBLIC_KEY`, `IZIPAY_PROD_HMAC`.
- `C2U_LIVE_ENABLED=true`, `C2U_RUC`, `C2U_USER`, `C2U_PASSWORD`, `C2U_SERIE_BOLETA`, `C2U_SERIE_FACTURA`; verificar valores tributarios con el emisor.
- `STAGING_ORIGIN` apuntará al HTTPS real de la aplicación desplegada (dominio temporal durante pruebas; `https://malba-pmc.com` tras migrar). Verificar IPN desde Izipay hacia el host correcto.
- En Dashboard → Eventos, seleccionar `Izipay LIVE` solo cuando el estado técnico lo habilite; activar compras después de verificar un pago real pequeño autorizado y un comprobante fiscal válido y correlacionado.
- Nunca pegar credenciales en GitHub, cliente JavaScript o mensajes.
- Validar duplicados, IPN repetidas, pago fallido, token vencido, factura con RUC, boleta con DNI, correos y caso de facturación ambiguo sin reemisión automática.

## Despliegue y DNS
- No tocar `main` ni `malba-pmc.com` durante revisión.
- Ejecutar tests; publicar primero en Hostinger temporal y verificar cambios visuales y correos.
- Respaldar archivos/configuración/DB antes del cambio de dominio.
- Conservar MX, SPF, DKIM y DMARC de los correos.
- Comprobar SSL, URLs absolutas, canonical, sitemap, `noindex` de staging y política de redirecciones.
- Ningún enlace o pago real debe anunciarse como activo sin pruebas end-to-end en el proveedor.
