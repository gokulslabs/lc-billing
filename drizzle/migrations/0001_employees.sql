create table public.employees (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  mobile text,
  department text not null,
  gender text,
  address text,
  created_at timestamptz not null default now()
);

grant select on public.employees to authenticated;
grant all on public.employees to service_role;
alter table public.employees enable row level security;

create policy "Admins read employees" on public.employees
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
