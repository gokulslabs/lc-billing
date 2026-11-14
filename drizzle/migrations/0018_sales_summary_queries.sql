begin;

create or replace function public.shop_dashboard_summary(p_day date, p_new_counter_from date)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with scoped_bills as (
    select id, billed_on, status
    from public.invoices
    where status in ('open', 'partial')
       or (billed_on = p_day and status not in ('cancelled', 'draft'))
  ), bill_totals as (
    select b.*,
      coalesce(l.net, 0) as net,
      coalesce(l.quantity, 0) as quantity,
      coalesce(p.paid, 0) as paid
    from scoped_bills b
    cross join lateral (
      select sum(amount) as net, sum(quantity) as quantity
      from public.invoice_lines where invoice_id = b.id
    ) l
    cross join lateral (
      select sum(amount) as paid from public.payments
      where invoice_id = b.id and mode is distinct from 'PENDING'
    ) p
  ), daily_bills as (
    select count(*) as bills, coalesce(sum(net), 0) as net,
      coalesce(sum(quantity), 0) as quantity, coalesce(sum(paid), 0) as paid
    from bill_totals where billed_on = p_day
  ), outstanding as (
    select
      count(*) filter (where billed_on >= p_new_counter_from) as new_count,
      coalesce(sum(net - paid) filter (where billed_on >= p_new_counter_from), 0) as new_amount,
      count(*) filter (where billed_on < p_new_counter_from) as old_count,
      coalesce(sum(net - paid) filter (where billed_on < p_new_counter_from), 0) as old_amount
    from bill_totals where status in ('open', 'partial') and net > paid
  ), daily_payments as (
    select coalesce(sum(amount), 0) as collected,
      coalesce(sum(amount) filter (where mode = 'CASH'), 0) as cash,
      coalesce(sum(amount) filter (where mode = 'UPI'), 0) as upi,
      coalesce(sum(amount) filter (where mode = 'CARD'), 0) as card
    from public.payments where paid_on = p_day and mode is distinct from 'PENDING'
  ), stitching as (
    select count(*) filter (where status = 'READY') as ready,
      count(*) filter (where status in ('PENDING', 'TRIAL') and delivery_on = p_day) as due_today,
      count(*) filter (where status in ('PENDING', 'TRIAL') and delivery_on < p_day) as overdue
    from public.stitching_orders
  )
  select jsonb_build_object(
    'salesAmount', d.net, 'salesQuantity', d.quantity, 'billsToday', d.bills,
    'collections', p.collected, 'dueOnToday', greatest(0, d.net - d.paid),
    'unpaidBills', o.new_count, 'unpaidAmount', o.new_amount,
    'oldUnpaidBills', o.old_count, 'oldUnpaidAmount', o.old_amount,
    'readyStitching', s.ready, 'dueTodayStitching', s.due_today, 'overdueStitching', s.overdue,
    'cash', p.cash, 'upi', p.upi, 'card', p.card
  )
  from daily_bills d cross join outstanding o cross join daily_payments p cross join stitching s;
$$;

create or replace function public.shop_invoice_report(p_from date, p_to date, p_cancelled boolean)
returns table (
  "billNo" text, "billedOn" date, "customerName" text,
  gross numeric, discount numeric, net numeric, remarks text
)
language sql stable security invoker set search_path = ''
as $$
  select b.bill_no, b.billed_on, coalesce(c.name, ''), l.gross, l.gross - l.net, l.net, b.remarks
  from public.invoices b
  left join public.customers c on c.id = b.customer_id
  cross join lateral (
    select coalesce(sum(round(quantity * rate, 2)), 0) as gross, coalesce(sum(amount), 0) as net
    from public.invoice_lines where invoice_id = b.id
  ) l
  where b.billed_on between p_from and p_to
    and case when p_cancelled then b.status = 'cancelled'
             else b.status not in ('draft', 'cancelled') end
  order by b.billed_on, b.id;
$$;

create or replace function public.shop_pending_report(
  p_new_counter_from date, p_old boolean, p_offset integer, p_limit integer
)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with balances as (
    select b.id, b.bill_no, b.billed_on, coalesce(c.name, '') as customer_name,
      l.net as invoiced, p.paid, l.net - p.paid as balance,
      case when p.paid > 0 then 'partial' else 'open' end as status
    from public.invoices b
    left join public.customers c on c.id = b.customer_id
    cross join lateral (
      select coalesce(sum(amount), 0) as net from public.invoice_lines where invoice_id = b.id
    ) l
    cross join lateral (
      select coalesce(sum(amount), 0) as paid from public.payments
      where invoice_id = b.id and mode is distinct from 'PENDING'
    ) p
    where b.status in ('open', 'partial')
      and (b.billed_on < p_new_counter_from) = p_old
      and l.net > p.paid
  ), page as (
    select * from balances order by billed_on, id limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'billNo', b.bill_no, 'billedOn', b.billed_on, 'customerName', b.customer_name,
        'showroom', r.showroom, 'invoiced', b.invoiced, 'paid', b.paid,
        'balance', b.balance, 'status', b.status
      ) order by b.billed_on, b.id)
      from page b
      cross join lateral (
        select string_agg(s.showroom, ', ' order by s.first_id) as showroom
        from (
          select showroom, min(id::text) as first_id
          from public.payments where invoice_id = b.id and mode is distinct from 'PENDING'
            and showroom is not null and showroom <> ''
          group by showroom
        ) s
      ) r
    ), '[]'::jsonb),
    'total', count(*),
    'totals', jsonb_build_object('invoiced', coalesce(sum(invoiced), 0),
      'paid', coalesce(sum(paid), 0), 'balance', coalesce(sum(balance), 0))
  )
  from balances;
$$;

revoke all on function public.shop_dashboard_summary(date, date),
  public.shop_invoice_report(date, date, boolean),
  public.shop_pending_report(date, boolean, integer, integer)
from public, anon, authenticated;

grant execute on function public.shop_dashboard_summary(date, date),
  public.shop_invoice_report(date, date, boolean),
  public.shop_pending_report(date, boolean, integer, integer)
to service_role;

notify pgrst, 'reload schema';
commit;
