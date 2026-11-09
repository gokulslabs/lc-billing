alter table public.stitching_orders
  add column if not exists description text,
  add column if not exists processes text[] not null default '{}';
