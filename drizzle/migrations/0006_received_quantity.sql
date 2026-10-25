alter table public.inventory_items
  add column if not exists received_quantity numeric(12,3);

update public.inventory_items
set received_quantity = quantity
where received_quantity is null;

alter table public.inventory_items
  alter column received_quantity set not null;

alter table public.inventory_items
  alter column received_quantity set default 0;
