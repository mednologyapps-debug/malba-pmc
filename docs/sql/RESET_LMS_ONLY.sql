-- MALBA PMC | Reinicio exclusivo del Aula Virtual (LMS)
-- EJECUTAR MANUALMENTE EN SUPABASE SQL EDITOR, solo después de revisar el alcance.
-- IRREVERSIBLE: alumnos, accesos, matrículas, cursos, lecciones, evaluaciones y certificados.
-- NO modifica CMS, Academia comercial ni documentos del sitio.
-- No borres auth.users de toda la base: únicamente cuentas identificadas por lms_students.
-- Si existen archivos en storage.malba-lms, elimínalos antes desde Storage API/Panel,
-- NO uses DELETE directo en storage.objects.
BEGIN;
SET LOCAL lock_timeout='8s';
CREATE TEMP TABLE malba_reset_students ON COMMIT DROP AS
  SELECT id FROM public.lms_students;
-- No eliminar usuarios compartidos con contenido CMS: detener y revisar antes.
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM auth.users a JOIN malba_reset_students s ON a.id=s.id
   WHERE EXISTS (SELECT 1 FROM public.cms_programs c WHERE c.created_by=a.id OR c.updated_by=a.id)
      OR EXISTS (SELECT 1 FROM public.cms_publications c WHERE c.created_by=a.id OR c.updated_by=a.id)
      OR EXISTS (SELECT 1 FROM public.cms_solutions c WHERE c.created_by=a.id OR c.updated_by=a.id)
      OR EXISTS (SELECT 1 FROM public.cms_site_settings c WHERE c.updated_by=a.id)
 ) THEN RAISE EXCEPTION 'Hay alumnos vinculados a ediciones CMS. Revise estas cuentas antes de eliminarlas.'; END IF;
 IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='malba-lms')
 THEN RAISE EXCEPTION 'Hay archivos en malba-lms. Elimínalos desde Storage API/Panel antes de continuar.'; END IF;
END $$;
-- Las claves foráneas CASCADE eliminan módulos, lecciones, materiales,
-- matrículas, avances, intentos y certificados asociados.
DELETE FROM public.lms_courses;
DELETE FROM public.lms_students;
DELETE FROM auth.users WHERE id IN (SELECT id FROM malba_reset_students);
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.lms_courses)
 OR EXISTS(SELECT 1 FROM public.lms_students)
 OR EXISTS(SELECT 1 FROM public.lms_modules)
 OR EXISTS(SELECT 1 FROM public.lms_lessons)
 OR EXISTS(SELECT 1 FROM public.lms_materials)
 OR EXISTS(SELECT 1 FROM public.lms_enrollments)
 OR EXISTS(SELECT 1 FROM public.lms_progress)
 OR EXISTS(SELECT 1 FROM public.lms_quiz_attempts)
 OR EXISTS(SELECT 1 FROM public.lms_certificates)
 THEN RAISE EXCEPTION 'El LMS no quedó vacío; se cancela la transacción.'; END IF;
END $$;
COMMIT;
SELECT
 (SELECT count(*) FROM public.lms_courses) AS cursos,
 (SELECT count(*) FROM public.lms_students) AS alumnos,
 (SELECT count(*) FROM public.lms_lessons) AS lecciones,
 (SELECT count(*) FROM public.lms_enrollments) AS matriculas;
