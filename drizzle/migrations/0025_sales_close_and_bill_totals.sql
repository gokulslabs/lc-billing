begin;

create function public.shop_bill_amounts(p_ids uuid[])
returns table (invoice_id uuid, gross numeric, net numeric, collected numeric)
language sql stable security invoker set search_path = ''
as $$
  select i.id, l.gross, l.net, p.collected
  from public.invoices i
  cross join lateral (
    select coalesce(sum(round(quantity * rate, 2)), 0) as gross,
           coalesce(sum(amount), 0) as net
    from public.invoice_lines where invoice_id = i.id
  ) l
  cross join lateral (
    select coalesce(sum(amount), 0) as collected from public.payments
    where invoice_id = i.id and mode is distinct from 'PENDING'
  ) p
  where i.id = any(p_ids)
  order by i.id;
$$;

create function public.shop_day_close(p_day date, p_modes text[])
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with bills as (
    select x.net, x.net - x.collected as balance
    from public.shop_bill_amounts(array(
      select id from public.invoices
      where billed_on = p_day and status not in ('cancelled', 'draft')
    )) x
  ), bill_totals as (
    select count(*) as bills, coalesce(sum(net), 0) as billed,
           coalesce(sum(balance), 0) as due, count(*) filter (where balance > 0) as unpaid
    from bills
  ), payment_totals as (
    select mode, sum(amount) as amount
    from public.payments where paid_on = p_day group by mode
  ), payments as (
    select coalesce(sum(amount) filter (where mode is distinct from 'PENDING'), 0) as collected,
           coalesce(sum(amount) filter (where mode = 'PENDING'), 0) as pending
    from payment_totals
  )
  select jsonb_build_object(
    'date', p_day, 'bills', b.bills, 'billed', b.billed, 'due', b.due, 'unpaid', b.unpaid,
    'collected', p.collected, 'pending', p.pending,
    'modes', coalesce((
      select jsonb_agg(jsonb_build_object('mode', m.mode, 'amount', coalesce(t.amount, 0)) order by m.ordinal)
      from unnest(p_modes) with ordinality as m(mode, ordinal)
      left join payment_totals t on t.mode = m.mode
    ), '[]'::jsonb)
  )
  from bill_totals b cross join payments p;
$$;

revoke all on function public.shop_bill_amounts(uuid[]), public.shop_day_close(date, text[])
from public, anon, authenticated;
grant execute on function public.shop_bill_amounts(uuid[]), public.shop_day_close(date, text[])
to service_role;
notify pgrst, 'reload schema';

commit;
