begin;

-- Paginated, server-side report datasets for the admin analytics workspace.
-- Sales rules match shop_invoice_report: drafts and cancelled bills are excluded;
-- real payments exclude the synthetic PENDING rows.
create or replace function public.shop_advanced_analytics(
  p_from date, p_to date, p_section text default 'overview',
  p_page integer default 1, p_page_size integer default 25, p_search text default ''
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_result jsonb;
  v_offset integer := greatest(coalesce(p_page, 1) - 1, 0) * least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_limit integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text := '%' || coalesce(p_search, '') || '%';
  v_days integer := greatest(p_to - p_from + 1, 1);
  v_prev_from date := p_from - greatest(p_to - p_from + 1, 1);
  v_prev_to date := p_from - 1;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range';
  end if;

  if p_section = 'overview' then
    with bills as (
      select i.id, i.customer_id, i.billed_on,
        coalesce(sum(l.amount), 0)::numeric as net,
        coalesce(sum(round(l.quantity * l.rate, 2)), 0)::numeric as gross
      from public.invoices i left join public.invoice_lines l on l.invoice_id = i.id
      where i.status not in ('draft', 'cancelled')
      group by i.id
    ), paid as (
      select p.invoice_id, sum(p.amount)::numeric as amount from public.payments p
      where p.mode is distinct from 'PENDING' and p.paid_on <= p_to group by p.invoice_id
    ), current_stats as (
      select count(*)::integer as bill_count,
        coalesce(sum(b.net),0)::numeric as net_sales,
        coalesce(sum(b.gross),0)::numeric as gross_sales,
        (select coalesce(sum(pm.amount),0)::numeric from public.payments pm join bills pb on pb.id=pm.invoice_id
          where pm.paid_on between p_from and p_to and pm.mode is distinct from 'PENDING' and pm.mode is distinct from 'SALES RETURN') as collected,
        count(distinct b.customer_id)::integer as customers,
        count(distinct b.customer_id) filter (where b.customer_id in (
          select customer_id from bills where billed_on < p_from group by customer_id
        ))::integer as returning_customers
      from bills b left join paid p on p.invoice_id=b.id
      where b.billed_on between p_from and p_to
    ), previous_stats as (
      select count(*)::integer as bill_count, coalesce(sum(b.net),0)::numeric as net_sales,
        (select coalesce(sum(pm.amount),0)::numeric from public.payments pm join bills pb on pb.id=pm.invoice_id
          where pm.paid_on between v_prev_from and v_prev_to and pm.mode is distinct from 'PENDING' and pm.mode is distinct from 'SALES RETURN') as collected
      from bills b where b.billed_on between v_prev_from and v_prev_to
    ), trend as (
      select d.day, coalesce(s.sales,0)::numeric as sales, coalesce(c.collected,0)::numeric as collected
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d(day)
      left join (select billed_on as date_day, sum(net) sales from bills where billed_on between p_from and p_to group by billed_on) s on s.date_day=d.day::date
      left join (select p.paid_on as date_day, sum(p.amount) collected from public.payments p join bills b on b.id=p.invoice_id where p.paid_on between p_from and p_to and p.mode is distinct from 'PENDING' and p.mode is distinct from 'SALES RETURN' group by p.paid_on) c on c.date_day=d.day::date
    )
    select jsonb_build_object(
      'summary', (select to_jsonb(x) || jsonb_build_object('average_bill_value', case when bill_count=0 then 0 else net_sales/bill_count end,
        'outstanding_balance',(select greatest(coalesce(sum(b.net),0)-coalesce(sum(coalesce(pm.amount,0)),0),0)::numeric from bills b left join paid pm on pm.invoice_id=b.id where b.billed_on<=p_to)) from current_stats x),
      'previous', (select to_jsonb(x) || jsonb_build_object('average_bill_value', case when bill_count=0 then 0 else net_sales/bill_count end) from previous_stats x),
      'trend', coalesce((select jsonb_agg(jsonb_build_object('date',day,'sales',sales,'collected',collected) order by day) from trend), '[]'::jsonb),
      'weeklyTrend', coalesce((select jsonb_agg(jsonb_build_object('date',week_start,'sales',sales,'collected',collected) order by week_start) from (select date_trunc('week',day)::date week_start,sum(sales) sales,sum(collected) collected from trend group by 1) q), '[]'::jsonb),
      'monthlyTrend', coalesce((select jsonb_agg(jsonb_build_object('date',month_start,'sales',sales,'collected',collected) order by month_start) from (select date_trunc('month',day)::date month_start,sum(sales) sales,sum(collected) collected from trend group by 1) q), '[]'::jsonb)
    ) into v_result;
  elsif p_section = 'customers' then
    with eligible as (
      select i.id, i.customer_id, i.billed_on, coalesce(sum(l.amount),0)::numeric net
      from public.invoices i left join public.invoice_lines l on l.invoice_id=i.id
      where i.status not in ('draft','cancelled') group by i.id
    ), balances as (
      select e.customer_id, count(*) filter(where e.billed_on between p_from and p_to)::integer bill_count,
        count(distinct e.billed_on) filter(where e.billed_on between p_from and p_to)::integer visit_days,
        greatest(coalesce(sum(e.net) filter(where e.billed_on between p_from and p_to),0)-
          coalesce(sum(coalesce(pay.return_amount,0)) filter(where e.billed_on between p_from and p_to),0),0)::numeric spend,
        min(e.billed_on) filter(where e.billed_on between p_from and p_to) first_purchase,
        max(e.billed_on) filter(where e.billed_on between p_from and p_to) last_purchase,
        coalesce(sum(e.net) filter(where e.billed_on<=p_to),0)::numeric lifetime_net,
        coalesce(sum(coalesce(pay.amount,0)) filter(where e.billed_on<=p_to),0)::numeric lifetime_paid
      from eligible e left join (select invoice_id,sum(amount) amount,
        sum(amount) filter(where mode='SALES RETURN') return_amount
        from public.payments where mode is distinct from 'PENDING' and paid_on<=p_to group by invoice_id) pay on pay.invoice_id=e.id
      group by e.customer_id
    ), ranked as (
      select c.id,c.name,c.phone,b.bill_count,b.visit_days,b.spend,b.first_purchase,b.last_purchase,
        case when b.bill_count=0 then 0 else b.spend/b.bill_count end average_bill_value,
        greatest(b.lifetime_net-b.lifetime_paid,0)::numeric outstanding,
        case when exists(select 1 from eligible x where x.customer_id=c.id and x.billed_on < p_from) then 'Returning' else 'New' end customer_type
      from balances b join public.customers c on c.id=b.customer_id
      where b.bill_count>0 and (p_search='' or c.name ilike v_search or coalesce(c.phone,'') ilike v_search)
    ), page_rows as (
      select * from ranked order by spend desc, visit_days desc, bill_count desc, name limit v_limit offset v_offset
    )
    select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows),'[]'::jsonb),
      'total',(select count(*) from ranked),
      'topSpend',coalesce((select jsonb_agg(to_jsonb(t) order by spend desc) from (select * from ranked order by spend desc, name limit 10) t),'[]'::jsonb),
      'topVisitDays',coalesce((select jsonb_agg(to_jsonb(t) order by visit_days desc) from (select * from ranked order by visit_days desc, spend desc, name limit 10) t),'[]'::jsonb),
      'topBills',coalesce((select jsonb_agg(to_jsonb(t) order by bill_count desc) from (select * from ranked order by bill_count desc, spend desc, name limit 10) t),'[]'::jsonb)) into v_result;
  elsif p_section = 'sales' then
    with eligible as (
      select i.id,i.bill_no,i.customer_id,i.billed_on,i.status, coalesce(sum(l.amount),0)::numeric net,
        coalesce(sum(round(l.quantity*l.rate,2)),0)::numeric gross
      from public.invoices i left join public.invoice_lines l on l.invoice_id=i.id
      where i.status not in ('draft','cancelled') and i.billed_on between p_from and p_to group by i.id
    ), groups as (
      select g.id,g.name, sum(l.amount)::numeric net_sales,
        sum(l.quantity) filter(where pr.unit='NO')::numeric pieces_sold,
        sum(l.quantity) filter(where pr.unit='MT')::numeric metres_sold
      from eligible i join public.invoice_lines l on l.invoice_id=i.id join public.products pr on pr.id=l.product_id join public.product_groups g on g.id=pr.group_id
      group by g.id,g.name
    ), products as (
      select pr.id,pr.code,pr.name,pr.unit,sum(l.quantity)::numeric quantity_sold,sum(l.amount)::numeric net_sales
      from eligible i join public.invoice_lines l on l.invoice_id=i.id join public.products pr on pr.id=l.product_id
      group by pr.id,pr.code,pr.name,pr.unit
    ), payments as (
      select coalesce(p.mode,'Not recorded') method,sum(p.amount)::numeric amount
      from public.payments p join public.invoices i on i.id=p.invoice_id
      where i.status not in ('draft','cancelled') and p.mode is distinct from 'PENDING' and p.mode is distinct from 'SALES RETURN' and p.paid_on between p_from and p_to group by 1
    ), due as (
      select i.id,i.bill_no,i.billed_on,c.name customer_name, sum(l.amount)::numeric net,
        coalesce(p.amount,0)::numeric paid, greatest(sum(l.amount)-coalesce(p.amount,0),0)::numeric balance
      from public.invoices i join public.customers c on c.id=i.customer_id left join public.invoice_lines l on l.invoice_id=i.id
      left join (select invoice_id,sum(amount) amount from public.payments where mode is distinct from 'PENDING' and paid_on<=p_to group by invoice_id) p on p.invoice_id=i.id
      where i.status not in ('draft','cancelled') and i.billed_on <= p_to group by i.id,c.name,p.amount
      having sum(l.amount)>coalesce(p.amount,0)
    ), sales_rows as (
      select e.id,e.bill_no,e.billed_on,e.customer_id,c.name customer_name,e.gross,e.net,(e.gross-e.net)::numeric discount from eligible e join public.customers c on c.id=e.customer_id
    ), grouped_rows as (
      select * from groups where p_search='' or name ilike v_search order by net_sales desc limit v_limit offset v_offset
    ), product_rows as (
      select * from products where p_search='' or code ilike v_search or name ilike v_search order by net_sales desc limit v_limit offset v_offset
    ), quantity_rows as (
      select * from products where p_search='' or code ilike v_search or name ilike v_search order by quantity_sold desc,net_sales desc limit 10
    ), bills_rows as (
      select * from sales_rows where p_search='' or bill_no ilike v_search or customer_name ilike v_search order by billed_on desc,id limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'summary',jsonb_build_object('grossSales',(select coalesce(sum(gross),0) from eligible),'discounts',(select coalesce(sum(gross-net),0) from eligible),'netSales',(select coalesce(sum(net),0) from eligible),'collections',(select coalesce(sum(amount),0) from payments),
        'cancelledBillValue',(select coalesce(sum(l.amount),0) from public.invoices i join public.invoice_lines l on l.invoice_id=i.id where i.status='cancelled' and i.billed_on between p_from and p_to),
        'salesReturnCredits',(select coalesce(sum(p.amount),0) from public.payments p join public.invoices i on i.id=p.invoice_id where i.status not in ('draft','cancelled') and p.mode='SALES RETURN' and p.paid_on between p_from and p_to)),
      'methods',coalesce((select jsonb_agg(to_jsonb(payments) order by amount desc) from payments),'[]'::jsonb),
      'aging',jsonb_build_object('0_30',(select coalesce(sum(balance),0) from due where billed_on >= (p_to-30)), '31_60',(select coalesce(sum(balance),0) from due where billed_on < p_to-30 and billed_on >= p_to-60), '61_90',(select coalesce(sum(balance),0) from due where billed_on < p_to-60 and billed_on >= p_to-90), 'over_90',(select coalesce(sum(balance),0) from due where billed_on < p_to-90)),
      'groups',coalesce((select jsonb_agg(to_jsonb(grouped_rows)) from grouped_rows),'[]'::jsonb), 'groupTotal',(select count(*) from groups where p_search='' or name ilike v_search),
      'products',coalesce((select jsonb_agg(to_jsonb(product_rows)) from product_rows),'[]'::jsonb), 'productTotal',(select count(*) from products where p_search='' or code ilike v_search or name ilike v_search),
      'productsByQuantity',coalesce((select jsonb_agg(to_jsonb(quantity_rows) order by quantity_sold desc) from quantity_rows),'[]'::jsonb),
      'bills',coalesce((select jsonb_agg(to_jsonb(bills_rows)) from bills_rows),'[]'::jsonb), 'billTotal',(select count(*) from sales_rows)
    ) into v_result;
  elsif p_section = 'inventory' then
    with stock as (
      select pr.id,pr.group_id,pr.code,pr.name,pr.unit,pr.price,
        coalesce(sum(it.quantity) filter(where it.status='available'),0)::numeric available_quantity,
        count(it.id) filter(where it.status='available')::integer stock_items,
        count(it.id) filter(where it.status='available' and it.cost is not null)::integer cost_covered_items,
        coalesce(sum(it.quantity*pr.price) filter(where it.status='available'),0)::numeric retail_value,
        coalesce(sum(it.quantity*it.cost) filter(where it.status='available' and it.cost is not null),0)::numeric recorded_cost_value
      from public.products pr left join public.inventory_items it on it.product_id=pr.id group by pr.id
    ), sold as (
      select l.product_id,sum(l.quantity)::numeric quantity_sold,sum(l.amount)::numeric net_sales
      from public.invoice_lines l join public.invoices i on i.id=l.invoice_id
      where i.status not in ('draft','cancelled') and i.billed_on between p_from and p_to group by l.product_id
    ), stock_flags as (
      select it.inventory_no,pr.code,pr.name,it.received_quantity received,
        coalesce(sum(l.quantity) filter(where i.id is not null),0)::numeric billed,it.quantity on_hand,
        round(it.quantity-round(it.received_quantity-coalesce(sum(l.quantity) filter(where i.id is not null),0),3),3) difference
      from public.inventory_items it join public.products pr on pr.id=it.product_id
      left join public.invoice_lines l on l.inventory_item_id=it.id
      left join public.invoices i on i.id=l.invoice_id and i.status<>'cancelled'
      where p_search='' or it.inventory_no ilike v_search or pr.code ilike v_search or pr.name ilike v_search
      group by it.id,pr.code,pr.name
      having round(it.quantity-round(it.received_quantity-coalesce(sum(l.quantity) filter(where i.id is not null),0),3),3)<>0
    ), rows as (
      select s.*,g.name group_name,coalesce(x.quantity_sold,0)::numeric quantity_sold,coalesce(x.net_sales,0)::numeric net_sales,
        (s.available_quantity>0 and coalesce(x.quantity_sold,0)>0 and coalesce(x.quantity_sold,0)<=1) slow_moving
      from stock s join public.product_groups g on g.id=s.group_id left join sold x on x.product_id=s.id
      where p_search='' or s.code ilike v_search or s.name ilike v_search or g.name ilike v_search
    ), page_rows as (select * from rows order by retail_value desc,name limit v_limit offset v_offset),
    group_stock as (select group_name,unit,sum(available_quantity)::numeric available_quantity,sum(retail_value)::numeric retail_value,count(*) filter(where available_quantity>0)::integer stocked_products from rows group by group_name,unit),
    top_selling as (select * from rows where quantity_sold>0 order by net_sales desc,quantity_sold desc limit 10)
    select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows),'[]'::jsonb),'total',(select count(*) from rows),
      'summary',jsonb_build_object('retailValue',(select coalesce(sum(retail_value),0) from stock),'productsInStock',(select count(*) from stock where available_quantity>0),
        'costCoveredItems',(select coalesce(sum(cost_covered_items),0) from stock),'stockItems',(select coalesce(sum(stock_items),0) from stock),
        'productsWithoutSales',(select count(*) from stock s where s.available_quantity>0 and not exists(select 1 from sold x where x.product_id=s.id)),
        'slowMovingProducts',(select count(*) from rows where slow_moving),'reconciliationFlags',(select count(*) from stock_flags)),
      'groups',coalesce((select jsonb_agg(to_jsonb(group_stock) order by retail_value desc) from group_stock),'[]'::jsonb),
      'topSelling',coalesce((select jsonb_agg(to_jsonb(top_selling) order by net_sales desc) from top_selling),'[]'::jsonb),
      'stockFlags',coalesce((select jsonb_agg(to_jsonb(flag_rows) order by inventory_no) from (select * from stock_flags order by inventory_no limit v_limit offset v_offset) flag_rows),'[]'::jsonb),
      'stockFlagTotal',(select count(*) from stock_flags)) into v_result;
  elsif p_section = 'stitching' then
    with orders as (
      select o.id,o.order_no,o.ordered_on,o.delivery_on,o.status,o.amount,o.customer_id,
        coalesce(c.name,'') customer_name,coalesce(sp.name,'Unspecified') garment,
        (o.status in ('PENDING','TRIAL') and o.delivery_on < p_to) overdue,
        (o.status in ('PENDING','TRIAL') and o.ordered_on < (o.created_at at time zone 'Asia/Kolkata')::date) legacy_pending
      from public.stitching_orders o join public.customers c on c.id=o.customer_id left join public.stitching_products sp on sp.id=o.stitching_product_id
    ), rows as (
      select * from orders
      where (ordered_on between p_from and p_to
        or (status in ('PENDING','TRIAL') and delivery_on <= p_to)
        or (status in ('PENDING','TRIAL') and legacy_pending))
        and (p_search='' or order_no ilike v_search or customer_name ilike v_search or garment ilike v_search)
    ), page_rows as (
      select * from rows order by ordered_on desc,order_no desc limit v_limit offset v_offset
    )
    select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows),'[]'::jsonb),'total',(select count(*) from rows),
      'summary',jsonb_build_object('received',(select count(*) from orders where ordered_on between p_from and p_to),
        'pending',(select count(*) from public.stitching_orders where status in ('PENDING','TRIAL')),
        'overdue',(select count(*) from public.stitching_orders where status in ('PENDING','TRIAL') and delivery_on < p_to),
        'ready',(select count(*) from public.stitching_orders where status='READY'),
        'delivered',(select count(*) from public.stitching_orders where status in ('DELIVERED','COMPLETED') and ordered_on between p_from and p_to),
        'legacyPending',(select count(*) from public.stitching_orders where status in ('PENDING','TRIAL') and ordered_on < (created_at at time zone 'Asia/Kolkata')::date)),
      'garments',coalesce((select jsonb_agg(jsonb_build_object('garment',garment,'received',received,'pending',pending,'overdue',overdue,'ready',ready,'delivered',delivered) order by received desc)
        from (select garment,count(*) filter(where ordered_on between p_from and p_to)::integer received,count(*) filter(where status in ('PENDING','TRIAL'))::integer pending,count(*) filter(where overdue)::integer overdue,count(*) filter(where status='READY')::integer ready,count(*) filter(where status in ('DELIVERED','COMPLETED'))::integer delivered from orders group by garment) g),'[]'::jsonb)
    ) into v_result;
  else
    raise exception 'Unknown analytics section';
  end if;
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.shop_advanced_analytics(date,date,text,integer,integer,text) from public, anon, authenticated;
grant execute on function public.shop_advanced_analytics(date,date,text,integer,integer,text) to service_role;
notify pgrst, 'reload schema';
commit;
