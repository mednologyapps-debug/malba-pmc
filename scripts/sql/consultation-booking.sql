-- Private reservation data. Only the Node server can access these objects.
create table public.consultation_settings (
 id boolean primary key default true check(id),
 consultant_email text not null default '',
 enabled boolean not null default false,
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
insert into public.consultation_settings(id) values(true);
create table public.consultation_slots (
 id uuid primary key default gen_random_uuid(),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '4 hours'),
 unique(starts_at,ends_at)
);
create table public.consultation_bookings (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 slot_id uuid not null references public.consultation_slots(id),
 name text not null check(length(name) between 3 and 120),
 email text not null check(length(email)<=254),
 company text not null default '' check(length(company)<=150),
 service text not null check(length(service)<=160),
 message text not null check(length(message) between 10 and 1500),
 consultant_email text not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','confirmed','declined')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index consultation_one_booking_per_slot on public.consultation_bookings(slot_id) where status in ('pending','confirmed');
create index consultation_slots_future on public.consultation_slots(starts_at) where enabled;
create table public.consultation_mail_outbox (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.consultation_bookings(id),
 kind text not null check(kind in ('requested_client','requested_consultant','confirmed_client','declined_client')),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','cancelled')),
 attempts integer not null default 0,
 last_error text,
 next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(booking_id,kind)
);
create index consultation_mail_pending on public.consultation_mail_outbox(next_attempt_at) where status in ('pending','failed');
alter table public.consultation_settings enable row level security;
alter table public.consultation_slots enable row level security;
alter table public.consultation_bookings enable row level security;
alter table public.consultation_mail_outbox enable row level security;
revoke all on public.consultation_settings,public.consultation_slots,public.consultation_bookings,public.consultation_mail_outbox from anon,authenticated;
grant all on public.consultation_settings,public.consultation_slots,public.consultation_bookings,public.consultation_mail_outbox to service_role;

create function public.consultation_add_slots(p_slots jsonb) returns integer
language plpgsql security invoker set search_path=public as $$
declare item jsonb; begin_at timestamptz; finish_at timestamptz; total integer=0;
begin
 perform pg_advisory_xact_lock(hashtext('malba-consultation-agenda'));
 if not exists(select 1 from consultation_settings where id and enabled and consultant_email<>'') then raise exception 'Configura el correo de Miguel y activa la agenda antes de publicar horarios.'; end if;
 if jsonb_typeof(p_slots)<>'array' or jsonb_array_length(p_slots) not between 1 and 32 then raise exception 'Selecciona entre 1 y 32 horarios.'; end if;
 for item in select * from jsonb_array_elements(p_slots) loop
  begin_at=(item->>'starts_at')::timestamptz; finish_at=(item->>'ends_at')::timestamptz;
  if begin_at is null or finish_at is null or begin_at<now()+interval '1 hour' or begin_at>now()+interval '180 days' or finish_at<=begin_at or finish_at>begin_at+interval '4 hours' then raise exception 'Revisa las fechas y duración de los horarios.'; end if;
  if exists(select 1 from consultation_slots where (enabled or exists(select 1 from consultation_bookings b where b.slot_id=consultation_slots.id and b.status in ('pending','confirmed'))) and tstzrange(starts_at,ends_at,'[)') && tstzrange(begin_at,finish_at,'[)')) then raise exception 'El horario coincide con otro horario publicado o reservado.'; end if;
  insert into consultation_slots(starts_at,ends_at,enabled) values(begin_at,finish_at,true)
   on conflict(starts_at,ends_at) do update set enabled=true;
  total=total+1;
 end loop;
 return total;
end; $$;

create function public.consultation_reserve(p_request uuid,p_slot uuid,p_name text,p_email text,p_company text,p_service text,p_message text,p_token_hash text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare existing consultation_bookings; slot consultation_slots; settings consultation_settings; booking_id uuid;
begin
 perform pg_advisory_xact_lock(hashtext('malba-consultation-agenda'));
 select * into existing from consultation_bookings where request_id=p_request;
 if found then
  if existing.slot_id<>p_slot or existing.email<>p_email or existing.name<>p_name or existing.company<>p_company or existing.service<>p_service or existing.message<>p_message then raise exception 'La solicitud cambió. Recarga el calendario antes de reintentar.'; end if;
  return jsonb_build_object('status',existing.status,'duplicate',true);
 end if;
 select * into settings from consultation_settings where id;
 if not settings.enabled or settings.consultant_email='' then raise exception 'La agenda todavía no está disponible.'; end if;
 select * into slot from consultation_slots where id=p_slot and enabled for update;
 if slot.id is null or slot.starts_at<now()+interval '1 hour' or exists(select 1 from consultation_bookings where slot_id=p_slot and status in ('pending','confirmed')) then raise exception 'Este horario ya no está disponible. Elige otro en el calendario.'; end if;
 insert into consultation_bookings(request_id,slot_id,name,email,company,service,message,consultant_email,token_hash)
 values(p_request,p_slot,p_name,p_email,p_company,p_service,p_message,settings.consultant_email,p_token_hash) returning id into booking_id;
 insert into consultation_mail_outbox(booking_id,kind) values(booking_id,'requested_client'),(booking_id,'requested_consultant');
 return jsonb_build_object('status','pending','duplicate',false);
end; $$;

create function public.consultation_decide(p_id uuid,p_token_hash text,p_status text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare booking consultation_bookings; slot consultation_slots;
begin
 perform pg_advisory_xact_lock(hashtext('malba-consultation-agenda'));
 if p_status not in ('confirmed','declined') then raise exception 'Selecciona una respuesta válida.'; end if;
 select * into booking from consultation_bookings where (p_token_hash is not null and token_hash=p_token_hash) or (p_token_hash is null and id=p_id) for update;
 if booking.id is null then raise exception 'La solicitud no está disponible.'; end if;
 if booking.status=p_status then return jsonb_build_object('status',booking.status,'duplicate',true); end if;
 select * into slot from consultation_slots where id=booking.slot_id;
 if slot.starts_at<=now() then raise exception 'La fecha de esta solicitud ya pasó.'; end if;
 if booking.status='declined' then raise exception 'La solicitud ya fue rechazada. El cliente debe elegir otro horario.'; end if;
 update consultation_bookings set status=p_status,updated_at=now() where id=booking.id;
 insert into consultation_mail_outbox(booking_id,kind) values(booking.id,case when p_status='confirmed' then 'confirmed_client' else 'declined_client' end) on conflict(booking_id,kind) do nothing;
 return jsonb_build_object('status',p_status,'duplicate',false);
end; $$;
revoke all on function public.consultation_add_slots(jsonb),public.consultation_reserve(uuid,uuid,text,text,text,text,text,text),public.consultation_decide(uuid,text,text) from public,anon,authenticated;
grant execute on function public.consultation_add_slots(jsonb),public.consultation_reserve(uuid,uuid,text,text,text,text,text,text),public.consultation_decide(uuid,text,text) to service_role;
