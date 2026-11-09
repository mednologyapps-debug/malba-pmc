alter table public.book_invoice_jobs
 add column delivery_copy_status text check (delivery_copy_status in ('pending','sending','sent','review')),
 add column delivery_copy_error text,
 add column delivery_provider_status text,
 add column delivery_copy_sent_at timestamptz;