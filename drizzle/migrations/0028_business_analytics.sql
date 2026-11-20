begin;

-- Keep broad analytics in Postgres and return only grouped results to the app.
create or replace function public.shop_business_analytics(p_from date, p_to date)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
with active_invoices as (
  select i.id, i.customer_id, i.billed_on,
    coalesce(sum(l.amount), 0)::numeric as net
  from public.invoices i
  left join public.invoice_lines l on l.invoice_id = i.id
  where i.status not in ('draft', 'cancelled')
  group by i.id
), paid_by_invoice as (
  select p.invoice_id, sum(p.amount)::numeric as paid
  from public.payments p
  join active_invoices i on i.id = p.invoice_id
  where p.mode is distinct from 'PENDING'
  group by p.invoice_id
), sales_by_date as (
  select i.billed_on as day, sum(i.net)::numeric as sales
  from active_invoices i
  where i.billed_on between p_from and p_to
  group by i.billed_on
), collections_by_date as (
  select p.paid_on as day, sum(p.amount)::numeric as collected
  from public.payments p
  join active_invoices i on i.id = p.invoice_id
  where p.paid_on between p_from and p_to
    and p.mode is distinct from 'PENDING'
  group by p.paid_on
), trend as (
  select coalesce(s.day, c.day) as day,
    coalesce(s.sales, 0)::numeric as sales,
    coalesce(c.collected, 0)::numeric as collected
  from sales_by_date s
  full outer join collections_by_date c on c.day = s.day
), methods as (
  select coalesce(p.mode, 'Not recorded') as method, sum(p.amount)::numeric as collected
  from public.payments p
  join active_invoices i on i.id = p.invoice_id
  where p.paid_on between p_from and p_to
    and p.mode is distinct from 'PENDING'
  group by coalesce(p.mode, 'Not recorded')
), lifetime_customers as (
  select c.id, c.name,
    count(i.id)::integer as bill_count,
    coalesce(sum(i.net), 0)::numeric as net_sales,
    coalesce(sum(p.paid), 0)::numeric as collected
  from public.customers c
  join active_invoices i on i.customer_id = c.id
  left join paid_by_invoice p on p.invoice_id = i.id
  group by c.id, c.name
), lifetime_products as (
  select p.id, p.code, p.name, p.unit,
    coalesce(sum(l.quantity), 0)::numeric as quantity_sold,
    coalesce(sum(l.amount), 0)::numeric as net_sales
  from public.products p
  join public.invoice_lines l on l.product_id = p.id
  join active_invoices i on i.id = l.invoice_id
  group by p.id, p.code, p.name, p.unit
), product_stock as (
  select p.id, p.group_id, p.price,
    coalesce(sum(i.quantity) filter (where i.status = 'available'), 0)::numeric as quantity
  from public.products p
  left join public.inventory_items i on i.product_id = p.id
  group by p.id, p.group_id, p.price
), inventory_groups as (
  select g.id, g.name,
    count(*) filter (where s.quantity > 0)::integer as stocked_styles,
    sum(s.quantity)::numeric as quantity,
    sum(s.quantity * s.price)::numeric as retail_value
  from public.product_groups g
  join product_stock s on s.group_id = g.id
  group by g.id, g.name
), summary as (
  select
    (select count(*)::integer from active_invoices where billed_on between p_from and p_to) as bill_count,
    (select coalesce(sum(net), 0)::numeric from active_invoices where billed_on between p_from and p_to) as net_sales,
    (select coalesce(sum(p.amount), 0)::numeric from public.payments p
      join active_invoices i on i.id = p.invoice_id
      where p.paid_on between p_from and p_to and p.mode is distinct from 'PENDING') as collected,
    (select count(*)::integer from product_stock where quantity > 0) as stocked_styles,
    (select count(*)::integer from public.products) as catalogue_styles,
    (select coalesce(sum(quantity * price), 0)::numeric from product_stock) as retail_stock_value,
    (select count(*)::integer from lifetime_customers where collected > 0) as paying_customers,
    (select count(*)::integer from public.customers) as customer_count
)
select jsonb_build_object(
  'summary', (select to_jsonb(summary) from summary),
  'bucket', case when p_to - p_from > 62 then 'month' else 'day' end,
  'trend', coalesce((select jsonb_agg(jsonb_build_object(
    'date', date_bucket,
    'label', case when p_to - p_from > 62 then to_char(date_bucket, 'Mon YY') else to_char(date_bucket, 'DD Mon') end,
    'sales', sales, 'collected', collected
  ) order by date_bucket) from (
    select case when p_to - p_from > 62 then date_trunc('month', day)::date else day end as date_bucket,
      sum(sales)::numeric as sales, sum(collected)::numeric as collected
    from trend group by date_bucket
  ) grouped_trend), '[]'::jsonb),
  'paymentMethods', coalesce((select jsonb_agg(jsonb_build_object(
    'method', method, 'collected', collected
  ) order by collected desc) from methods), '[]'::jsonb),
  'topProducts', coalesce((select jsonb_agg(jsonb_build_object(
    'code', code, 'name', name, 'unit', unit, 'quantitySold', quantity_sold, 'netSales', net_sales
  ) order by quantity_sold desc, net_sales desc) from (
    select * from lifetime_products order by quantity_sold desc, net_sales desc limit 10
  ) ranked_products), '[]'::jsonb),
  'topCustomers', coalesce((select jsonb_agg(jsonb_build_object(
    'name', name, 'billCount', bill_count, 'netSales', net_sales, 'collected', collected
  ) order by collected desc, net_sales desc) from (
    select * from lifetime_customers where collected > 0
    order by collected desc, net_sales desc limit 10
  ) ranked_customers), '[]'::jsonb),
  'inventoryGroups', coalesce((select jsonb_agg(jsonb_build_object(
    'name', name, 'stockedStyles', stocked_styles, 'quantity', quantity, 'retailValue', retail_value
  ) order by retail_value desc) from inventory_groups), '[]'::jsonb)
);
$$;

revoke all on function public.shop_business_analytics(date, date) from public, anon, authenticated;
grant execute on function public.shop_business_analytics(date, date) to service_role;
notify pgrst, 'reload schema';

commit;
