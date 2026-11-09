-- Public storefront sign-ups must never receive an admin or staff role.
-- Staff account bootstrap remains unchanged for non-customer accounts.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );

  if new.raw_user_meta_data->>'account_type' = 'customer' then
    return new;
  end if;

  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
    insert into public.employees (id, full_name, email, department)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      new.email,
      'ADMIN'
    );
  end if;
  return new;
end;
$$;


-- The storefront checks this before opening public registration. If the database
-- migration has not been deployed yet, customer sign-ups stay safely disabled.
create or replace function public.customer_signup_enabled()
returns boolean
language sql
immutable
security definer
set search_path = public
as $$
  select true
$$;

grant execute on function public.customer_signup_enabled() to anon, authenticated, service_role;
