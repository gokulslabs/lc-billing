create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  book_no text,
  created_at timestamptz not null default now()
);

create index customers_phone_idx on public.customers (phone);
create index customers_book_no_idx on public.customers (book_no);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  inventory_no text not null unique,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity >= 0),
  status text not null default 'available',
  created_at timestamptz not null default now()
);

create index inventory_items_product_id_idx on public.inventory_items (product_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  bill_no text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  billed_on date not null default current_date,
  status text not null default 'open',
  remarks text,
  created_at timestamptz not null default now()
);

create index invoices_customer_id_idx on public.invoices (customer_id);
create index invoices_billed_on_idx on public.invoices (billed_on);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  inventory_no text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  rate numeric(12,2) not null check (rate >= 0),
  amount numeric(12,2) not null check (amount >= 0)
);

create index invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  paid_on date not null default current_date,
  showroom text,
  created_at timestamptz not null default now()
);

create index payments_invoice_id_idx on public.payments (invoice_id);
create index payments_paid_on_idx on public.payments (paid_on);

create table public.stitching_products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.stitching_processes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0
);

create table public.stitching_measurement_fields (
  id uuid primary key default gen_random_uuid(),
  stitching_product_id uuid not null references public.stitching_products(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  unique (stitching_product_id, label)
);

create table public.stitching_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_no text not null unique,
  bag_no text,
  stitching_product_id uuid references public.stitching_products(id) on delete restrict,
  ordered_on date not null default current_date,
  delivery_on date,
  status text not null default 'PENDING',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now()
);

create index stitching_orders_customer_id_idx on public.stitching_orders (customer_id);

create table public.stitching_order_measurements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.stitching_orders(id) on delete cascade,
  label text not null,
  value text not null,
  sort_order integer not null default 0
);

insert into public.stitching_products (name) values
  ('BLOUSE'),
  ('SUIT'),
  ('LEHANGA'),
  ('PREPLEATING');

insert into public.stitching_processes (name, sort_order) values
  ('FALLS', 1),
  ('TASSELS', 2),
  ('PRE-PLEATING', 3),
  ('INSKIRT', 4),
  ('AARI WORK', 5),
  ('EMBROIDARY WORK', 6),
  ('STITCHING', 7),
  ('HEMING', 8);

grant select on
  public.customers,
  public.inventory_items,
  public.invoices,
  public.invoice_lines,
  public.payments,
  public.stitching_products,
  public.stitching_processes,
  public.stitching_measurement_fields,
  public.stitching_orders,
  public.stitching_order_measurements
to authenticated;

grant all on
  public.customers,
  public.inventory_items,
  public.invoices,
  public.invoice_lines,
  public.payments,
  public.stitching_products,
  public.stitching_processes,
  public.stitching_measurement_fields,
  public.stitching_orders,
  public.stitching_order_measurements
to service_role;

alter table public.customers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;
alter table public.stitching_products enable row level security;
alter table public.stitching_processes enable row level security;
alter table public.stitching_measurement_fields enable row level security;
alter table public.stitching_orders enable row level security;
alter table public.stitching_order_measurements enable row level security;

create policy "Shop reads customers" on public.customers
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "Shop reads inventory items" on public.inventory_items
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "Shop reads invoices" on public.invoices
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "Shop reads invoice lines" on public.invoice_lines
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "Shop reads payments" on public.payments
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "Shop reads stitching products" on public.stitching_products
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "Shop reads stitching processes" on public.stitching_processes
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "Shop reads measurement fields" on public.stitching_measurement_fields
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "Shop reads stitching orders" on public.stitching_orders
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));

create policy "Shop reads order measurements" on public.stitching_order_measurements
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'staff'));
