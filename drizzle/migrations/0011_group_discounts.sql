create function public.save_group_discounts(changes jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  saved integer;
begin
  update public.product_groups as groups
  set discount_percent = change.discount
  from jsonb_to_recordset(changes) as change(id uuid, discount numeric, previous numeric)
  where groups.id = change.id and groups.discount_percent = change.previous;

  get diagnostics saved = row_count;
  if saved <> jsonb_array_length(changes) then
    raise exception 'Product groups changed' using errcode = '40001';
  end if;
end;
$$;

revoke execute on function public.save_group_discounts(jsonb) from public, anon, authenticated;
grant execute on function public.save_group_discounts(jsonb) to service_role;
