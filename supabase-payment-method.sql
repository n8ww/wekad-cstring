-- Wekad: preferred payment method chosen by the customer (transfer / tabby / tamara)
alter table public.orders add column if not exists payment_method text;
