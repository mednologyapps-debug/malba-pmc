-- Allow a matching existing participant to continue an unpaid order or add a book.
CREATE OR REPLACE FUNCTION public.book_register(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare ev book_events; person book_participants; reg book_registrations; ord book_orders; occupied integer; state text; c jsonb;
begin
 select * into ev from book_events where id='presentacion-libro' for update;
 c:=ev.config;
 if nullif(c->>'launchUntil','') is not null and now()>=(c->>'launchUntil')::timestamptz then
  c:=jsonb_set(c,'{price}',coalesce(c->'regularPrice',c->'price'));
 end if;
 if nullif(c->>'privacyUrl','') is null or c->>'status'<>'published' or not (c->>'registrationOpen')::boolean or nullif(c->>'date','') is null or nullif(c->>'location','') is null or nullif(c->>'capacity','') is null then raise exception 'Las inscripciones todavía no están abiertas.'; end if;
 if nullif(c->>'deadline','') is not null and (c->>'deadline')::timestamptz<now() then raise exception 'El plazo de inscripción ha finalizado.'; end if;
 if (c->>'date')::timestamptz<=now() then raise exception 'Este evento ya finalizó.'; end if;
 select * into person from book_participants where email=lower(payload->>'email');
 if payload->>'mode' not in ('free','book') then raise exception 'Modalidad inválida.'; end if;
 if payload->>'mode'='book' and (not coalesce((c->>'priceConfirmed')::boolean,false) or not coalesce((c->>'bookAvailable')::boolean,false) or coalesce(c->>'paymentMode','disabled') not in ('sandbox','production') or not coalesce(c->'deliveries' ? (payload->>'delivery'),false)) then raise exception 'La compra del libro aún no está habilitada.'; end if;
 if person.id is not null then
  select * into reg from book_registrations where event_id=ev.id and participant_id=person.id for update;
  if found then
   if payload->>'mode'<>'book' or reg.status='cancelled' or
      regexp_replace(regexp_replace(person.phone,'[^0-9]','','g'),'^51([0-9]{9})$','\1') is distinct from
      regexp_replace(regexp_replace(payload->>'phone','[^0-9]','','g'),'^51([0-9]{9})$','\1') then
    return jsonb_build_object('duplicate',true);
   end if;
   select * into ord from book_orders where registration_id=reg.id for update;
   if found then
    if ord.status not in ('pending','failed') then return jsonb_build_object('duplicate',true); end if;
   else
    update book_registrations set mode='book' where id=reg.id;
    insert into book_orders(registration_id,amount,delivery) values(reg.id,(c->>'price')::numeric,payload->>'delivery') returning * into ord;
   end if;
   return jsonb_build_object('id',reg.id,'status',reg.status,'orderId',ord.id,'amount',ord.amount);
  end if;
 end if;
 select count(*) into occupied from book_registrations where event_id=ev.id and status='registered';
 state:='registered';
 if occupied>=(c->>'capacity')::integer then
  if (c->>'waitlist')::boolean then state:='waitlist'; else raise exception 'Se completó el aforo de inscripciones.'; end if;
 end if;
 insert into book_participants(email,full_name,phone,company,position) values(lower(payload->>'email'),payload->>'name',payload->>'phone',coalesce(payload->>'company',''),coalesce(payload->>'position',''))
 on conflict(email) do update set email=excluded.email returning * into person;
 insert into book_registrations(event_id,participant_id,mode,status,utm) values(ev.id,person.id,payload->>'mode',state,coalesce(payload->'utm','{}')) returning * into reg;
 if reg.mode='book' then insert into book_orders(registration_id,amount,delivery) values(reg.id,(c->>'price')::numeric,payload->>'delivery') returning * into ord; end if;
 if reg.mode='free' then
  insert into book_mail_outbox(registration_id,kind) values(reg.id,'registration'),(reg.id,'admin');
 end if;
 return jsonb_build_object('id',reg.id,'status',state,'orderId',ord.id,'amount',ord.amount);
end $function$;
