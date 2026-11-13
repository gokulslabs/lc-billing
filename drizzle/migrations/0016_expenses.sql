create table if not exists public.expense_records (
  id uuid primary key default gen_random_uuid(),
  sheet text not null check (sheet in ('ledger', 'target')),
  entry_date date not null,
  sort_order bigint generated always as identity,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists expense_records_date_idx on public.expense_records (entry_date, sheet, sort_order);
alter table public.expense_records enable row level security;
