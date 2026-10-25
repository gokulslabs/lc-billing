create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));

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
