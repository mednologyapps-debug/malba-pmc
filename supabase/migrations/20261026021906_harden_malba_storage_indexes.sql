-- MALBA PMC: additive hardening for CMS/LMS production data.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('malba-cms', 'malba-cms', false, 5242880, array['image/png','image/jpeg','image/webp','image/avif','application/pdf']),
  ('malba-lms', 'malba-lms', false, 104857600, array['application/pdf','image/png','image/jpeg','image/webp','video/mp4','application/zip','text/plain'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types,updated_at=now();

drop policy if exists cms_history_admin_read on public.cms_history;
create policy cms_history_admin_read on public.cms_history for select to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists cms_history_admin_write on public.cms_history;
create policy cms_history_admin_write on public.cms_history for insert to authenticated
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create index if not exists cms_programs_created_by_idx on public.cms_programs (created_by);
create index if not exists cms_programs_updated_by_idx on public.cms_programs (updated_by);
create index if not exists cms_publications_created_by_idx on public.cms_publications (created_by);
create index if not exists cms_publications_updated_by_idx on public.cms_publications (updated_by);
create index if not exists cms_site_settings_updated_by_idx on public.cms_site_settings (updated_by);
create index if not exists cms_solutions_created_by_idx on public.cms_solutions (created_by);
create index if not exists cms_solutions_updated_by_idx on public.cms_solutions (updated_by);
create index if not exists lms_certificates_course_id_idx on public.lms_certificates (course_id);
create index if not exists lms_courses_created_by_idx on public.lms_courses (created_by);
create index if not exists lms_courses_source_program_id_idx on public.lms_courses (source_program_id);
create index if not exists lms_courses_updated_by_idx on public.lms_courses (updated_by);
create index if not exists lms_enrollments_last_lesson_id_idx on public.lms_enrollments (last_lesson_id);
create index if not exists lms_materials_lesson_id_idx on public.lms_materials (lesson_id);
create index if not exists lms_progress_lesson_id_idx on public.lms_progress (lesson_id);
create index if not exists lms_quiz_attempts_course_id_idx on public.lms_quiz_attempts (course_id);
create index if not exists lms_quiz_attempts_lesson_id_idx on public.lms_quiz_attempts (lesson_id);
