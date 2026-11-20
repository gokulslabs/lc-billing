begin;

-- Serve the due-bills list from one aggregate query and only transfer the requested page.
create or replace function public.shop_due_report(
  p_new_counter_from date, p_old boolean, p_offset integer, p_limit integer
)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
with open_invoices as (
  select i.id, i.bill_no, i.customer_id, i.billed_on, i.status, i.remarks
  from public.invoices i
  where i.status in ('open', 'partial')
    and (i.billed_on < p_new_counter_from) = p_old
), line_totals as (
  select l.invoice_id,
    sum(round(l.quantity * l.rate, 2))::numeric as gross,
    sum(l.amount)::numeric as net
  from public.invoice_lines l
  join open_invoices i on i.id = l.invoice_id
  group by l.invoice_id
), payment_totals as (
  select p.invoice_id, sum(p.amount)::numeric as collected
  from public.payments p
  join open_invoices i on i.id = p.invoice_id
  where p.mode is distinct from 'PENDING'
  group by p.invoice_id
), balances as (
  select i.id, i.bill_no, i.customer_id, coalesce(c.name, '') as customer_name,
    i.billed_on, i.status, i.remarks,
    coalesce(l.gross, 0)::numeric as gross,
    coalesce(l.net, 0)::numeric as net,
    coalesce(p.collected, 0)::numeric as collected,
    round(coalesce(l.net, 0) - coalesce(p.collected, 0), 2)::numeric as balance
  from open_invoices i
  join public.customers c on c.id = i.customer_id
  left join line_totals l on l.invoice_id = i.id
  left join payment_totals p on p.invoice_id = i.id
  where round(coalesce(l.net, 0) - coalesce(p.collected, 0), 2) > 0.001
), page as (
  select * from balances
  order by billed_on asc, id asc
  offset greatest(p_offset, 0)
  limit p_limit
)
select jsonb_build_object(
  'invoices', coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'billNo', bill_no, 'customerId', customer_id,
    'customerName', customer_name, 'billedOn', billed_on,
    'status', status, 'remarks', remarks, 'gross', gross,
    'discount', gross - net, 'total', net, 'collected', collected, 'balance', balance
  ) order by billed_on asc, id asc) from page), '[]'::jsonb),
  'total', (select count(*) from balances),
  'balance', (select coalesce(sum(balance), 0) from balances),
  'books', case when p_old then 'old' else 'new' end
);
$$;

-- Replace full inventory row downloads with grouped counts and values.
create or replace function public.shop_inventory_summary()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
with stocked as (
  select i.product_id, i.quantity, p.group_id, p.price,
    round(i.quantity * p.price, 2) as amount
  from public.inventory_items i
  join public.products p on p.id = i.product_id
  where i.status = 'available'
), groups as (
  select g.id, g.name, round(sum(s.quantity), 3)::numeric as quantity,
    sum(s.amount)::numeric as amount
  from stocked s
  join public.product_groups g on g.id = s.group_id
  group by g.id, g.name
)
select jsonb_build_object(
  'groups', coalesce((select jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'quantity', quantity, 'amount', amount
  ) order by name) from groups), '[]'::jsonb),
  'slips', (select count(*) from stocked),
  'quantity', (select round(coalesce(sum(quantity), 0), 3) from stocked)
);
$$;

-- Customer history needs only lifetime totals here; do not reload every invoice and line on each page.
create or replace function public.shop_customer_totals(p_customer_id uuid)
returns table (billed numeric, collected numeric)
language sql stable security invoker set search_path = ''
as $$
select
  coalesce((
    select sum(l.amount)
    from public.invoices i
    join public.invoice_lines l on l.invoice_id = i.id
    where i.customer_id = p_customer_id
  ), 0)::numeric,
  coalesce((
    select sum(p.amount)
    from public.invoices i
    join public.payments p on p.invoice_id = i.id
    where i.customer_id = p_customer_id
      and p.mode is distinct from 'PENDING'
  ), 0)::numeric;
$$;

-- One query supplies all four stitching-board columns, including only the eight visible rows.
create or replace function public.shop_stitching_board(p_today date)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
with base as (
  select o.id, o.order_no, o.customer_id, coalesce(c.name, '') as customer_name,
    coalesce(c.phone, '') as customer_phone,
    coalesce(o.stitching_product_id::text, '') as product_id,
    coalesce(sp.name, '') as product_name,
    o.bag_no, o.ordered_on, o.delivery_on, o.status, o.amount,
    o.description, o.processes
  from public.stitching_orders o
  left join public.customers c on c.id = o.customer_id
  left join public.stitching_products sp on sp.id = o.stitching_product_id
), bucketed as (
  select 'overdue'::text as bucket, * from base
  where status in ('PENDING', 'TRIAL') and delivery_on < p_today
  union all
  select 'today'::text as bucket, * from base
  where status in ('PENDING', 'TRIAL') and delivery_on = p_today
  union all
  select 'week'::text as bucket, * from base
  where status in ('PENDING', 'TRIAL') and delivery_on > p_today and delivery_on <= p_today + 7
  union all
  select 'ready'::text as bucket, * from base where status = 'READY'
), ranked as (
  select *, row_number() over (
    partition by bucket
    order by case when bucket = 'ready' then ordered_on end desc,
      case when bucket <> 'ready' then delivery_on end asc nulls last,
      order_no asc, id asc
  ) as row_num, count(*) over (partition by bucket) as total
  from bucketed
), reports as (
  select bucket, jsonb_build_object(
    'orders', coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'orderNo', order_no, 'customerId', customer_id,
      'customerName', customer_name, 'customerPhone', customer_phone,
      'productId', product_id, 'productName', product_name,
      'bagNo', bag_no, 'orderedOn', ordered_on, 'deliveryOn', delivery_on,
      'status', status, 'amount', amount, 'description', description,
      'processes', processes, 'measurements', '[]'::jsonb
    ) order by row_num) filter (where row_num <= 8), '[]'::jsonb),
    'total', max(total)
  ) as report
  from ranked
  group by bucket
)
select jsonb_build_object(
  'overdue', coalesce((select report from reports where bucket = 'overdue'), '{"orders":[],"total":0}'::jsonb),
  'today', coalesce((select report from reports where bucket = 'today'), '{"orders":[],"total":0}'::jsonb),
  'week', coalesce((select report from reports where bucket = 'week'), '{"orders":[],"total":0}'::jsonb),
  'ready', coalesce((select report from reports where bucket = 'ready'), '{"orders":[],"total":0}'::jsonb)
);
$$;

create index if not exists stitching_orders_status_delivery_id_idx
  on public.stitching_orders (status, delivery_on, id);
create index if not exists stitching_orders_ordered_on_id_idx
  on public.stitching_orders (ordered_on desc, id desc);
create index if not exists invoices_open_due_book_idx
  on public.invoices (billed_on, id) where status in ('open', 'partial');
create index if not exists inventory_items_available_product_idx
  on public.inventory_items (product_id) include (quantity) where status = 'available';

revoke all on function public.shop_due_report(date, boolean, integer, integer),
  public.shop_inventory_summary(), public.shop_customer_totals(uuid),
  public.shop_stitching_board(date)
from public, anon, authenticated;
grant execute on function public.shop_due_report(date, boolean, integer, integer),
  public.shop_inventory_summary(), public.shop_customer_totals(uuid),
  public.shop_stitching_board(date)
to service_role;
notify pgrst, 'reload schema';

commit;
