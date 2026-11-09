-- Keep prior reservations and blocks while restricting newly booked sessions.
alter table public.consultation_bookings add column if not exists meeting_url text;

create or replace function public.consultation_business_hours(p_start timestamptz,p_end timestamptz)
returns boolean language sql immutable security invoker set search_path=public as $$
 select (p_start at time zone 'America/Lima')::date = (p_end at time zone 'America/Lima')::date
 and (p_start at time zone 'America/Lima')::time >= time '08:00'
 and (p_end at time zone 'America/Lima')::time <= time '19:00';
$$;
revoke all on function public.consultation_business_hours(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.consultation_business_hours(timestamptz,timestamptz) to service_role;

create or replace function public.consultation_ensure_slots(p_from timestamptz,p_to timestamptz) returns integer
language plpgsql security invoker set search_path=public as $$
declare total integer;
begin
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '32 days' or p_from>now()+interval '180 days' or p_to<now()-interval '1 day' then raise exception 'Selecciona un mes próximo.'; end if;
 perform pg_advisory_xact_lock(hashtext('malba-consultation-agenda'));
 insert into consultation_slots(starts_at,ends_at)
 select proposed,proposed+interval '1 hour'
 from generate_series(p_from,least(p_to-interval '1 hour',now()+interval '180 days'),interval '1 hour') proposed
 where proposed>=now()+interval '1 hour'
 and public.consultation_business_hours(proposed, proposed+interval '1 hour')
 and not exists(select 1 from consultation_slots s where tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(proposed,proposed+interval '1 hour','[)'))
 on conflict(starts_at,ends_at) do nothing;
 get diagnostics total=row_count;
 return total;
end; $$;

create or replace function public.consultation_reserve(p_request uuid,p_slot uuid,p_name text,p_email text,p_company text,p_service text,p_message text,p_token_hash text) returns jsonb
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
 if not settings.enabled then raise exception 'La agenda todavía no está disponible.'; end if;
 select * into slot from consultation_slots where id=p_slot and enabled for update;
 if slot.id is null or slot.starts_at<now()+interval '1 hour' or not public.consultation_business_hours(slot.starts_at,slot.ends_at) or exists(select 1 from consultation_bookings where slot_id=p_slot and status in ('pending','confirmed')) then raise exception 'Este horario ya no está disponible. Elige otro en el calendario.'; end if;
 insert into consultation_bookings(request_id,slot_id,name,email,company,service,message,consultant_email,token_hash)
 values(p_request,p_slot,p_name,p_email,p_company,p_service,p_message,settings.consultant_email,p_token_hash) returning id into booking_id;
 insert into consultation_mail_outbox(booking_id,kind) values(booking_id,'requested_client'),(booking_id,'requested_consultant');
 return jsonb_build_object('status','pending','duplicate',false);
end; $$;

create or replace function public.consultation_decide(p_id uuid,p_token_hash text,p_status text,p_meeting_url text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare booking consultation_bookings; slot consultation_slots;
begin
 perform pg_advisory_xact_lock(hashtext('malba-consultation-agenda'));
 if p_status is null or p_status not in ('confirmed','declined') then raise exception 'Selecciona una respuesta válida.'; end if;
 if p_status='confirmed' and (p_meeting_url is null or length(p_meeting_url)>2048 or p_meeting_url !~* '^https://[^[:space:]/?#]+[^[:space:]]*$') then
  raise exception 'Ingresa un enlace HTTPS válido para la sesión.';
 end if;
 select * into booking from consultation_bookings where (p_token_hash is not null and token_hash=p_token_hash) or (p_token_hash is null and id=p_id) for update;
 if booking.id is null then raise exception 'La solicitud no está disponible.'; end if;
 if booking.status=p_status then
  if p_status='confirmed' and booking.meeting_url is distinct from p_meeting_url then
   raise exception 'Esta solicitud ya fue confirmada con otro enlace.';
  end if;
  return jsonb_build_object('status',booking.status,'duplicate',true);
 end if;
 select * into slot from consultation_slots where id=booking.slot_id;
 if slot.starts_at<=now() then raise exception 'La fecha de esta solicitud ya pasó.'; end if;
 if booking.status='declined' then raise exception 'La solicitud ya fue rechazada. El cliente debe elegir otro horario.'; end if;
 update consultation_bookings set status=p_status,meeting_url=case when p_status='confirmed' then p_meeting_url else booking.meeting_url end,updated_at=now() where id=booking.id;
 insert into consultation_mail_outbox(booking_id,kind) values(booking.id,case when p_status='confirmed' then 'confirmed_client' else 'declined_client' end) on conflict(booking_id,kind) do nothing;
 return jsonb_build_object('status',p_status,'duplicate',false);
end; $$;

-- The old signature still supports rejections during a rolling deployment.
create or replace function public.consultation_decide(p_id uuid,p_token_hash text,p_status text) returns jsonb
language sql security invoker set search_path=public as $$
 select public.consultation_decide(p_id,p_token_hash,p_status,null::text);
$$;
revoke all on function public.consultation_decide(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.consultation_decide(uuid,text,text,text) to service_role;
notify pgrst, 'reload schema';
