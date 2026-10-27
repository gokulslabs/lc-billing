alter table public.payments add column if not exists mode text;

alter table public.payments drop constraint if exists payments_mode_check;
alter table public.payments
  add constraint payments_mode_check
  check (mode is null or mode in ('CASH', 'UPI', 'CARD'));

alter table public.inventory_items add column if not exists supplier_name text;
alter table public.inventory_items add column if not exists supplier_bill_no text;
alter table public.inventory_items add column if not exists cost numeric(12, 2);
