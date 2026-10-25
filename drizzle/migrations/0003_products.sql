create table public.product_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.product_groups(id) on delete restrict,
  code text not null unique,
  name text not null,
  unit text not null check (unit in ('NO', 'MT')),
  price numeric(12,2) not null check (price >= 0),
  created_at timestamptz not null default now()
);

create index products_group_id_idx on public.products (group_id);

grant select on public.product_groups, public.products to authenticated;
grant all on public.product_groups, public.products to service_role;

alter table public.product_groups enable row level security;
alter table public.products enable row level security;

create policy "Shop reads product groups" on public.product_groups
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "Shop reads products" on public.products
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));
