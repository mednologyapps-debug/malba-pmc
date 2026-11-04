-- Dedicated event data; no LMS tables are modified.
create table public.book_events (
 id text primary key, config jsonb not null default '{}', revision integer not null default 1,
 updated_at timestamptz not null default now()
);
insert into public.book_events(id,config) values ('presentacion-libro','{"title":"Presentación del libro de Miguel Alba","date":null,"location":"","capacity":null,"deadline":null,"status":"draft","registrationOpen":false,"waitlist":false,"price":150,"priceConfirmed":false,"bookAvailable":false,"paymentMode":"disabled","deliveries":[],"adminEmail":""}');
create table public.book_participants (
 id uuid primary key default gen_random_uuid(), email text not null unique check (email=lower(email)),
 full_name text not null, phone text not null, company text not null default '', position text not null default ''
);
create table public.book_registrations (
 id uuid primary key default gen_random_uuid(), event_id text not null references public.book_events(id),
 participant_id uuid not null references public.book_participants(id),
 mode text not null check(mode in ('free','book')), status text not null check(status in ('registered','waitlist','cancelled')),
 entered_at timestamptz, consent_at timestamptz not null default now(), consent_version text not null default 'event-v1-20261104',
 utm jsonb not null default '{}', created_at timestamptz not null default now(), unique(event_id,participant_id)
);
create index book_registrations_event_status_idx on public.book_registrations(event_id,status,created_at);
create index book_registrations_participant_idx on public.book_registrations(participant_id);
create table public.book_orders (
 id uuid primary key default gen_random_uuid(), registration_id uuid not null unique references public.book_registrations(id),
 amount numeric(10,2) not null check(amount>0), currency text not null default 'PEN' check(currency='PEN'),
 delivery text not null, status text not null default 'pending' check(status in ('pending','failed','simulated_paid','paid','cancelled')),
 provider_reference text unique, created_at timestamptz not null default now()
);
create table public.book_mail_outbox (
 id uuid primary key default gen_random_uuid(), registration_id uuid not null references public.book_registrations(id),
 kind text not null check(kind in ('registration','admin','purchase')), status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0, last_error text, updated_at timestamptz not null default now(), unique(registration_id,kind)
);
create index book_mail_pending_idx on public.book_mail_outbox(status,updated_at);
create table public.book_metrics (
 id bigint generated always as identity primary key, event_name text not null, source text not null default '', created_at timestamptz not null default now()
);
create index book_metrics_name_idx on public.book_metrics(event_name,created_at);
alter table public.book_events enable row level security;
alter table public.book_participants enable row level security;
alter table public.book_registrations enable row level security;
alter table public.book_orders enable row level security;
alter table public.book_mail_outbox enable row level security;
alter table public.book_metrics enable row level security;
revoke all on public.book_events,public.book_participants,public.book_registrations,public.book_orders,public.book_mail_outbox,public.book_metrics from anon,authenticated;
grant all on public.book_events,public.book_participants,public.book_registrations,public.book_orders,public.book_mail_outbox,public.book_metrics to service_role;
grant usage,select on sequence public.book_metrics_id_seq to service_role;
-- The event row lock serializes capacity checks, duplicate detection and order creation.
create function public.book_register(payload jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare ev book_events; person book_participants; reg book_registrations; ord book_orders; occupied integer; state text; c jsonb;
begin
 select * into ev from book_events where id='presentacion-libro' for update;
 c:=ev.config;
 if c->>'status'<>'published' or not (c->>'registrationOpen')::boolean or nullif(c->>'date','') is null or nullif(c->>'location','') is null or nullif(c->>'capacity','') is null then raise exception 'Las inscripciones todavía no están abiertas.'; end if;
 if nullif(c->>'deadline','') is not null and (c->>'deadline')::timestamptz<now() then raise exception 'El plazo de inscripción ha finalizado.'; end if;
 if (c->>'date')::timestamptz<=now() then raise exception 'Este evento ya finalizó.'; end if;
 select * into person from book_participants where email=lower(payload->>'email');
 if person.id is not null and exists(select 1 from book_registrations where event_id=ev.id and participant_id=person.id) then return jsonb_build_object('duplicate',true); end if;
 if payload->>'mode' not in ('free','book') then raise exception 'Modalidad inválida.'; end if;
 if payload->>'mode'='book' and (not coalesce((c->>'priceConfirmed')::boolean,false) or not coalesce((c->>'bookAvailable')::boolean,false) or c->>'paymentMode'<>'sandbox' or not (c->'deliveries' ? (payload->>'delivery'))) then raise exception 'La compra del libro aún no está habilitada.'; end if;
 select count(*) into occupied from book_registrations where event_id=ev.id and status='registered';
 state:='registered';
 if occupied>=(c->>'capacity')::integer then
  if (c->>'waitlist')::boolean then state:='waitlist'; else raise exception 'Se completó el aforo de inscripciones.'; end if;
 end if;
 insert into book_participants(email,full_name,phone,company,position) values(lower(payload->>'email'),payload->>'name',payload->>'phone',coalesce(payload->>'company',''),coalesce(payload->>'position',''))
 on conflict(email) do update set email=excluded.email returning * into person;
 insert into book_registrations(event_id,participant_id,mode,status,utm) values(ev.id,person.id,payload->>'mode',state,coalesce(payload->'utm','{}')) returning * into reg;
 if reg.mode='book' then insert into book_orders(registration_id,amount,delivery) values(reg.id,(c->>'price')::numeric,payload->>'delivery') returning * into ord; end if;
 insert into book_mail_outbox(registration_id,kind) values(reg.id,'registration'),(reg.id,'admin');
 return jsonb_build_object('id',reg.id,'status',state,'orderId',ord.id);
end $$;
revoke all on function public.book_register(jsonb) from public,anon,authenticated;
grant execute on function public.book_register(jsonb) to service_role;
create function public.book_admission(reg_id uuid, next_status text, enter boolean default false) returns void language plpgsql security invoker set search_path=public as $$
declare ev book_events; reg book_registrations; n integer;
begin
 select * into ev from book_events where id='presentacion-libro' for update;
 select * into reg from book_registrations where id=reg_id and event_id=ev.id for update;
 if reg.id is null then raise exception 'Inscripción no encontrada.'; end if;
 if next_status not in ('registered','waitlist','cancelled') then raise exception 'Estado no válido.'; end if;
 if next_status='registered' and reg.status<>'registered' then
 select count(*) into n from book_registrations where event_id=ev.id and status='registered';
 if nullif(ev.config->>'capacity','') is null or n>=(ev.config->>'capacity')::integer then raise exception 'No queda capacidad disponible.'; end if;
 end if;
 if enter and next_status<>'registered' then raise exception 'Primero confirma la inscripción.'; end if;
 update book_registrations set status=next_status,entered_at=case when enter then coalesce(entered_at,now()) when next_status<>'registered' then null else entered_at end where id=reg_id;
end $$;
revoke all on function public.book_admission(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.book_admission(uuid,text,boolean) to service_role;
