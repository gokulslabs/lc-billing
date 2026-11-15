begin;

create collation public.shop_numeric_bill_order (
  provider = icu, locale = 'en-u-kn-true', deterministic = false
);

create function public.shop_bills_by_date(
  p_from date, p_to date, p_ascending boolean, p_offset integer, p_limit integer
)
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with candidates as materialized (
    select b.id, b.bill_no, b.customer_id, b.billed_on, b.status, b.remarks
    from public.invoices b
    where (p_from is null or b.billed_on >= p_from)
      and (p_to is null or b.billed_on <= p_to)
      and (
        b.status <> 'draft'
        or (select coalesce(sum(l.amount), 0) from public.invoice_lines l where l.invoice_id = b.id) > 0
        or exists (select 1 from public.payments p where p.invoice_id = b.id
                   and p.amount > 0 and p.mode is distinct from 'PENDING')
      )
  ), numbered as (
    select c.*, row_number() over (order by
      case when p_ascending then billed_on end asc,
      case when not p_ascending then billed_on end desc,
      (case when p_ascending then bill_no end) collate public.shop_numeric_bill_order asc,
      (case when not p_ascending then bill_no end) collate public.shop_numeric_bill_order desc,
      id desc
    ) as position
    from candidates c
  )
  select jsonb_build_object(
    'total', (select count(*) from candidates),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(n) - 'position' order by n.position) from numbered n
      where n.position > p_offset and n.position <= p_offset::bigint + p_limit
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.shop_bills_by_date(date, date, boolean, integer, integer)
from public, anon, authenticated;
grant execute on function public.shop_bills_by_date(date, date, boolean, integer, integer)
to service_role;

notify pgrst, 'reload schema';

commit;
