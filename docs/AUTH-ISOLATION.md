# Corrección de aislamiento Auth — 26 de octubre de 2026

El cliente compartido con service_role ejecutaba signInWithPassword. Aunque
persistSession estaba desactivado, el SDK conservaba la sesión en memoria y
enviaba el token del alumno en consultas administrativas posteriores.

La validación de contraseña ahora crea un cliente efímero por petición, tanto
en login como en cambio de contraseña. El cliente administrativo nunca inicia
sesiones de alumnos. Los perfiles se consultan por el ID verificado por Auth;
los errores de consulta no se presentan como cuenta deshabilitada. Las cookies
también verifican el tipo de sesión firmado (admin/student).

Ejecutar `npm run test:node`. La integración usa supabase-js real con servidores
locales Auth, REST y SMTP, sin cuentas ni correos de producción. Prueba alta
habilitada, matrícula, entrega SMTP HTML/enlace, login, sesión de alumno,
reingreso del admin, CMS, cambio de contraseña, logins concurrentes,
deshabilitación real, fallo de consulta y rechazo de cookie de rol incorrecto.

La prueba contra el servidor anterior reprodujo 403 con el mensaje exacto
«Tu acceso al aula está deshabilitado». Con el servidor corregido pasa y
ninguna llamada administrativa recibe el token del alumno.

No se modifican RLS, roles de usuarios, contraseñas existentes ni DNS.
La recepción en una bandeja real de Hostinger sigue requiriendo una prueba
con un alumno de pruebas autorizado; SMTP local no verifica entregabilidad.
