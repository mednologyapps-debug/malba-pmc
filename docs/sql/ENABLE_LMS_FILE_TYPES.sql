-- MALBA PMC | Habilitar tipos admitidos en archivos de lecciones.
-- Ejecutar manualmente en Supabase SQL Editor si el bucket aún tiene restricciones previas.
-- Solo afecta storage.buckets.name='malba-lms'; conserva bucket privado y límite existente.
UPDATE storage.buckets
SET allowed_mime_types=ARRAY[
'application/pdf','image/png','image/jpeg','image/webp','video/mp4',
'application/zip','text/plain',
'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]::text[]
WHERE id='malba-lms';
SELECT name,public,file_size_limit,allowed_mime_types
FROM storage.buckets WHERE id='malba-lms';
