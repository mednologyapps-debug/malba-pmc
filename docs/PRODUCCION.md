# MALBA PMC · criterio de producción

## Fuente única de despliegue

El servidor Node que ejecuta CMS/LMS debe vivir en este repositorio. No se debe
volver a desplegar un ZIP generado fuera de Git: una nueva redistribución debe
incluir `server.js`, `package-lock.json`, las migraciones de `supabase/` y las
variables del entorno de Hostinger.

El dominio temporal debe apuntar a la rama `staging-hostinger`. El dominio
principal no se toca hasta completar la lista de humo.

## Variables mínimas

Duplica `.env.example` en las variables del entorno de Hostinger. Nunca subas
`.env`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASSWORD` ni `SESSION_SECRET` al
repositorio. La clave service-role solo puede vivir en el backend.
El runtime Node usa además `CMS_ADMIN_USER`, `CMS_ADMIN_PASSWORD` y
`CMS_COOKIE_SECRET`; no reutilices la contraseña de Supabase.

En Supabase Auth activa también **Leaked password protection** en
Authentication → Password Security; el advisor del proyecto la reporta
deshabilitada y no se puede activar mediante una migración SQL.

## Archivos privados

La migración `20261026021906_harden_malba_storage_indexes.sql` crea los buckets
privados `malba-cms` y `malba-lms`. El backend debe usar URLs firmadas y no
publicar directamente materiales de cursos. Los archivos locales de
`assets/uploads/` no son un respaldo de producción.

## SEO y lanzamiento

En staging se conserva `noindex`. Ejecutar `python scripts/seo_audit.py` antes
de publicar. Solo cuando el propietario confirme el lanzamiento:

```bash
python scripts/seo_release.py --site-url https://malba-pmc.com --production
python scripts/seo_audit.py --production
```

Después se debe validar el sitemap en Search Console y comprobar redirecciones
desde las rutas antiguas. El script no cambia DNS ni despliega por sí solo.

## Smoke test obligatorio

1. `/health` devuelve `ok` y una versión del runtime Node.
2. Login de administrador y lectura de `/api/content`.
3. Guardar borrador, vista previa, publicar e historial.
4. Crear curso, subir material privado y abrirlo como alumno.
5. Matricular, enviar correo HTML, iniciar sesión y completar una lección.
6. Emitir, descargar y verificar certificado.
7. Cerrar sesión y repetir desde un dispositivo móvil.
