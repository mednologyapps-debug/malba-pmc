-- Store a provider transaction reference for reconciliation, not a payment confirmation.
alter table public.book_payment_sessions
 add column if not exists recovery_transaction uuid,
 add column if not exists recovery_result text,
 add column if not exists recovery_checked_at timestamptz;
