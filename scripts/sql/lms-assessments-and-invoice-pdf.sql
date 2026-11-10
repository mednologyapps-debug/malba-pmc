alter table public.lms_lessons drop constraint lms_lessons_lesson_type_check,
 add constraint lms_lessons_lesson_type_check check (lesson_type in ('text','video','live','quiz','assignment'));

create table public.lms_assessment_submissions (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.lms_students(id),
 course_id uuid not null references public.lms_courses(id),
 lesson_id uuid not null references public.lms_lessons(id),
 kind text not null check (kind in ('quiz','assignment')),
 responses jsonb not null default '[]',
 objective_correct integer not null default 0,
 objective_total integer not null default 0,
 manual_total integer not null default 0,
 pass_percent integer not null default 70,
 file_id text,
 file_name text,
 submitted_at timestamptz not null default now(),
 score integer check (score between 0 and 100),
 feedback text,
 graded_at timestamptz,
 unique (student_id, lesson_id)
);
create index lms_assessment_course_idx on public.lms_assessment_submissions(course_id, submitted_at desc);
alter table public.lms_assessment_submissions enable row level security;
revoke all on public.lms_assessment_submissions from public, anon, authenticated;
grant select, insert, update on public.lms_assessment_submissions to service_role;

create function public.lms_assessment_submit_guard() returns trigger
language plpgsql security invoker set search_path=public as $$
declare lesson lms_lessons;
begin
 select l.* into lesson from lms_lessons l join lms_modules m on m.id=l.module_id
 join lms_courses c on c.id=m.course_id where l.id=new.lesson_id and c.id=new.course_id and c.status='published' for share of l;
 if lesson.id is null or lesson.lesson_type<>new.kind or not exists(
  select 1 from lms_enrollments e join lms_students s on s.id=e.student_id
  where e.course_id=new.course_id and e.student_id=new.student_id and e.status in ('active','completed')
  and (e.expires_at is null or e.expires_at >= (now() at time zone 'America/Lima')::date) and s.active and s.deleted_at is null
 ) then raise exception 'La actividad no está disponible para esta matrícula.'; end if;
 if new.kind='assignment' then
  if lesson.quiz->>'dueAt' is null or clock_timestamp() >= (lesson.quiz->>'dueAt')::timestamptz then
   raise exception 'El plazo de entrega terminó.';
  end if;
  insert into lms_progress(student_id,course_id,lesson_id,completed_at)
  values(new.student_id,new.course_id,new.lesson_id,now()) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger lms_assessment_submit before insert on public.lms_assessment_submissions
 for each row execute function public.lms_assessment_submit_guard();

create function public.lms_grade_assessment(p_id uuid,p_manual numeric,p_feedback text) returns integer
language plpgsql security invoker set search_path=public as $$
declare item lms_assessment_submissions; final_score integer;
begin
 select * into item from lms_assessment_submissions where id=p_id and kind='quiz' for update;
 if item.id is null or item.graded_at is not null then raise exception 'La evaluación no está pendiente.'; end if;
 if p_manual is null or p_manual<0 or p_manual>item.manual_total or item.manual_total<=0 then raise exception 'La puntuación manual es inválida.'; end if;
 final_score:=round(100*(item.objective_correct+p_manual)/(item.objective_total+item.manual_total));
 update lms_assessment_submissions set score=final_score,feedback=left(p_feedback,4000),graded_at=now() where id=p_id;
 if final_score>=item.pass_percent then
  insert into lms_progress(student_id,course_id,lesson_id,completed_at)
  values(item.student_id,item.course_id,item.lesson_id,now()) on conflict do nothing;
 end if;
 return final_score;
end $$;
revoke all on function public.lms_assessment_submit_guard(), public.lms_grade_assessment(uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.lms_assessment_submit_guard(), public.lms_grade_assessment(uuid,numeric,text) to service_role;

alter table public.book_invoice_jobs add column delivery_copy_attempts integer not null default 0;
