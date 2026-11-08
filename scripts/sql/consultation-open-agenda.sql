-- Reserve all future hourly sessions by default. Explicit blocks are retained.
create function public.consultation_ensure_slots(p_from timestamptz,p_to timestamptz) returns integer
language plpgsql security invoker set search_path=public as $$
declare total integer;
begin
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '32 days' or p_from>now()+interval '180 days' or p_to<now()-interval '1 day' then raise exception 'Selecciona un mes próximo.'; end if;
 perform pg_advisory_xact_lock(hashtext('malba-consultation-agenda'));
 insert into consultation_slots(starts_at,ends_at)
 select proposed,proposed+interval '1 hour'
 from generate_series(p_from,least(p_to-interval '1 hour',now()+interval '180 days'),interval '1 hour') proposed
 where proposed>=now()+interval '1 hour'
 and not exists(select 1 from consultation_slots s where tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(proposed,proposed+interval '1 hour','[)'))
 on conflict(starts_at,ends_at) do nothing;
 get diagnostics total=row_count;
 return total;
end; $$;
revoke all on function public.consultation_ensure_slots(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.consultation_ensure_slots(timestamptz,timestamptz) to service_role;

create function public.consultation_toggle_slot(p_id uuid,p_enabled boolean) returns boolean
language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext('malba-consultation-agenda'));
 if p_enabled is null then raise exception 'Selecciona bloquear o liberar el horario.'; end if;
 if exists(select 1 from consultation_bookings where slot_id=p_id and status in ('pending','confirmed')) then raise exception 'Este horario tiene una reserva. Responde o cancela la solicitud antes de modificarlo.'; end if;
 update consultation_slots set enabled=p_enabled where id=p_id and starts_at>now();
 if not found then raise exception 'El horario no está disponible.'; end if;
 return p_enabled;
end; $$;
revoke all on function public.consultation_toggle_slot(uuid,boolean) from public,anon,authenticated;
grant execute on function public.consultation_toggle_slot(uuid,boolean) to service_role;

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
 if slot.id is null or slot.starts_at<now()+interval '1 hour' or exists(select 1 from consultation_bookings where slot_id=p_slot and status in ('pending','confirmed')) then raise exception 'Este horario ya no está disponible. Elige otro en el calendario.'; end if;
 insert into consultation_bookings(request_id,slot_id,name,email,company,service,message,consultant_email,token_hash)
 values(p_request,p_slot,p_name,p_email,p_company,p_service,p_message,settings.consultant_email,p_token_hash) returning id into booking_id;
 insert into consultation_mail_outbox(booking_id,kind) values(booking_id,'requested_client'),(booking_id,'requested_consultant');
 return jsonb_build_object('status','pending','duplicate',false);
end; $$;
update public.consultation_settings set enabled=true,revision=revision+1,updated_at=now() where id and not enabled;
