alter table public.inventory_items
  add column if not exists stock_verified_at timestamptz,
  add column if not exists stock_verified_quantity numeric(12,3);

create index if not exists inventory_items_stock_verified_at_idx
  on public.inventory_items (stock_verified_at);
