# Izipay y facturación: revisión del 4 de noviembre de 2026

Se revisaron el repositorio, los nombres de variables disponibles, el snippet anterior de WordPress y la documentación aportada de tefacturo.

## Evidencia recuperada

- Izipay/Micuentaweb: snippet anterior del libro, con CreatePayment, formToken y constantes `VM_IZIPAY_*` en `wp-config.php`. Se identificaron referencias a `VM_IZIPAY_SHOP_ID`, `VM_IZIPAY_TEST_PASSWORD`, `VM_IZIPAY_TEST_PUBLIC_KEY`, `VM_IZIPAY_TEST_HMAC` y equivalentes de producción. No se validó que la configuración actualmente instalada siga siendo esa versión.
- Facturador: tefacturo.pe / CLOSE2U. Manual «Integración Comprobantes API REST y UBL Versión 4.3» aportado por el propietario. Autenticación mediante RUC, correo y clave; falta confirmar cuenta, entorno, series y numeración vigentes. El manual no acredita credenciales operativas de MALBA.
- El entorno actual no contiene claves Izipay ni CLOSE2U. No se accedió a la configuración privada del WordPress ni a sus claves actuales.

## Próximo paso de integración

Recuperar la configuración autorizada desde WordPress/Hostinger y trasladarla a variables privadas del servidor. Validar Izipay sandbox, firma del IPN, importe, moneda y referencia antes de habilitar pagos reales. Conectar emisión de boleta/factura solo después del pago verificado, con control de duplicados. Ningún cobro o comprobante real se habilitó en esta entrega.

## Pruebas disponibles

En el dominio temporal, abrir `/evento/presentacion-libro/?prueba=1`. Se usan perfiles sintéticos, sin introducir datos personales. Las solicitudes solo envían identificador de fixture, modalidad y confirmaciones. El backend no persiste datos proporcionados por el visitante ni accede a Supabase, SMTP, Izipay o CLOSE2U.

En el administrador, Eventos → Ver pruebas. Registros temporales por proceso, hasta dos horas o hasta reiniciar Node; no consumen aforo ni afectan duplicados reales. La apertura del evento en la base real fue rechazada por la revisión automática y no se aplicó la modificación. Permanecen los requisitos del registro real, incluidos aforo y privacidad.
