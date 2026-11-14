begin;

create function public.shop_save_stitching_order(
  p_id uuid, p_order jsonb, p_measurements jsonb
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  details public.stitching_orders;
  saved_id uuid;
begin
  select * into details from jsonb_populate_record(null::public.stitching_orders, p_order);

  if p_id is null then
    insert into public.stitching_orders (
      customer_id, stitching_product_id, bag_no, ordered_on, delivery_on,
      status, amount, description, processes
    ) values (
      details.customer_id, details.stitching_product_id, details.bag_no, details.ordered_on,
      details.delivery_on, details.status, details.amount, details.description, coalesce(details.processes, '{}')
    ) returning id into saved_id;
  else
    update public.stitching_orders as o
    set customer_id = details.customer_id,
      stitching_product_id = details.stitching_product_id,
      bag_no = details.bag_no,
      ordered_on = details.ordered_on,
      delivery_on = details.delivery_on,
      status = details.status,
      amount = details.amount,
      description = case when p_order ? 'description' then details.description else o.description end,
      processes = case when p_order ? 'processes' then details.processes else o.processes end
    where o.id = p_id returning o.id into saved_id;

    if not found then return null; end if;
    delete from public.stitching_order_measurements where order_id = saved_id;
  end if;

  insert into public.stitching_order_measurements (order_id, label, value, sort_order)
  select saved_id, measurement->>'label', measurement->>'value', ordinal::integer
  from jsonb_array_elements(p_measurements) with ordinality as m(measurement, ordinal);

  return saved_id;
end;
$$;

revoke all on function public.shop_save_stitching_order(uuid, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.shop_save_stitching_order(uuid, jsonb, jsonb) to service_role;
notify pgrst, 'reload schema';

commit;
