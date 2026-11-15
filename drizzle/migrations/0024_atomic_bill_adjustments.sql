begin;

create function public.shop_set_invoice_discount(p_invoice_id uuid, p_discount numeric)
returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  bill_status text;
  gross numeric;
  net numeric;
  discount numeric := round(p_discount, 2);
begin
  select status into bill_status from public.invoices where id = p_invoice_id for update;
  if not found then return 'not_found'; end if;
  if bill_status = 'cancelled' then return 'cancelled'; end if;

  select sum(round(quantity * rate, 2)) into gross
  from public.invoice_lines where invoice_id = p_invoice_id;
  if gross is null then return 'no_lines'; end if;
  if discount is null or discount < 0 or discount > gross then return 'invalid_discount'; end if;
  net := gross - discount;
  if net < (
    select coalesce(sum(amount), 0) from public.payments
    where invoice_id = p_invoice_id and mode is distinct from 'PENDING'
  ) then return 'below_collected'; end if;

  -- Round cumulative allocations so even a one-paise net is distributed without negative lines.
  with weighted as (
    select id, sum(round(quantity * rate, 2)) over (order by id) as running_gross
    from public.invoice_lines where invoice_id = p_invoice_id
  ), running as (
    select id, case when gross = 0 then 0 else round(net * running_gross / gross, 2) end as amount
    from weighted
  ), allocated as (
    select id, amount - lag(amount, 1, 0::numeric) over (order by id) as amount
    from running
  )
  update public.invoice_lines as line set amount = a.amount
  from allocated a where line.id = a.id;

  perform public.shop_refresh_invoice_status(p_invoice_id);
  return 'ok';
end;
$$;

create function public.shop_remove_invoice_payment(
  p_invoice_id uuid, p_payment_id uuid, p_today date, p_reason text
)
returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  bill_status text;
  removed public.payments;
  note text;
begin
  select status into bill_status from public.invoices where id = p_invoice_id for update;
  if not found then return 'not_found'; end if;
  if bill_status = 'cancelled' then return 'cancelled'; end if;

  select * into removed from public.payments
  where id = p_payment_id and invoice_id = p_invoice_id for update;
  if not found then return 'payment_not_found'; end if;
  if removed.paid_on <> p_today and removed.mode is distinct from 'PENDING' then
    return 'older_payment';
  end if;

  delete from public.payments where id = removed.id;
  note := format('Payment removed %s %s %s: %s', removed.paid_on, removed.amount,
    coalesce(removed.mode, 'Not recorded'), p_reason);
  update public.invoices set remarks = concat_ws(chr(10), nullif(remarks, ''), note)
  where id = p_invoice_id;

  perform public.shop_refresh_invoice_status(p_invoice_id);
  return 'ok';
end;
$$;

revoke all on function public.shop_set_invoice_discount(uuid, numeric),
  public.shop_remove_invoice_payment(uuid, uuid, date, text) from public, anon, authenticated;
grant execute on function public.shop_set_invoice_discount(uuid, numeric),
  public.shop_remove_invoice_payment(uuid, uuid, date, text) to service_role;
notify pgrst, 'reload schema';

commit;
