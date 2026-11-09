-- Disambiguate the invoice uniqueness target so verified production payments can settle.
CREATE OR REPLACE FUNCTION public.book_finish_izipay(session_id uuid, tx_id uuid, paid_amount integer, paid_currency text, paid_mode text, paid_shop text, paid_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare s book_payment_sessions; o book_orders;
begin
 select * into s from book_payment_sessions where id=session_id for update;
 if tx_id is null or s.id is null or s.amount_minor is distinct from paid_amount or s.currency is distinct from paid_currency or s.mode is distinct from paid_mode or s.shop_id is distinct from paid_shop or s.provider_order_id is distinct from paid_reference then raise exception 'Pago no conciliado'; end if;
 if s.status='paid' then
  if s.provider_tx<>tx_id then raise exception 'Revisar segundo pago para la misma referencia'; end if;
  return jsonb_build_object('paid',true,'duplicate',true);
 end if;
 update book_payment_sessions set status='paid',provider_tx=tx_id,paid_at=now() where id=s.id;
 if s.order_id is not null then
  select * into o from book_orders where id=s.order_id for update;
  if round(o.amount*100)::integer<>s.amount_minor or o.currency<>s.currency then raise exception 'Pedido no conciliado'; end if;
  if o.status='cancelled' then
   insert into book_invoice_jobs(session_id,status,last_error) values(s.id,'review','Pago recibido para pedido cancelado; revisar antes de emitir') on conflict on constraint book_invoice_jobs_session_id_key do nothing;
  elsif s.mode='PRODUCTION' then
   update book_orders set status='paid',provider_reference=tx_id::text where id=o.id;
   insert into book_invoice_jobs(session_id) values(s.id) on conflict on constraint book_invoice_jobs_session_id_key do nothing;
   insert into book_mail_outbox(registration_id,kind) values(o.registration_id,'purchase') on conflict(registration_id,kind) do nothing;
  else
   update book_orders set status='simulated_paid',provider_reference=tx_id::text where id=o.id and status in ('pending','failed');
  end if;
 end if;
 return jsonb_build_object('paid',true,'duplicate',false);
end $function$;
