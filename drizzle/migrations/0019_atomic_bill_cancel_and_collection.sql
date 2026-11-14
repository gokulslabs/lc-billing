begin;

-- Reconcile deployments that still have the earlier payment mode constraint.
alter table public.payments drop constraint if exists payments_mode_check;
alter table public.payments add constraint payments_mode_check
  check (mode is null or mode in (
    'CASH', 'UPI', 'CHEQUE', 'IMPS/NEFT', 'SALES RETURN', 'CARD', 'MAINTENANCE', 'PENDING', 'GIFT'
  ));

create function public.shop_cancel_invoice(p_invoice_id uuid, p_remarks text)
returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  bill_status text;
  expected integer;
  restored integer;
begin
  select status into bill_status from public.invoices where id = p_invoice_id for update;
  if not found then return 'not_found'; end if;
  if bill_status = 'cancelled' then return 'cancelled'; end if;
  if exists (select 1 from public.payments where invoice_id = p_invoice_id) then
    return 'has_payment';
  end if;

  with quantities as (
    select inventory_item_id, sum(quantity) as quantity
    from public.invoice_lines
    where invoice_id = p_invoice_id and inventory_item_id is not null
    group by inventory_item_id
  ), updated as (
    update public.inventory_items i
    set quantity = i.quantity + q.quantity, status = 'available'
    from quantities q where i.id = q.inventory_item_id
    returning i.id
  )
  select (select count(*) from quantities), (select count(*) from updated)
  into expected, restored;

  if restored <> expected then
    raise exception 'Could not restore stock for the invoice.';
  end if;

  update public.invoices set status = 'cancelled', remarks = p_remarks where id = p_invoice_id;
  return 'ok';
end;
$$;

create function public.shop_collect_invoice(
  p_invoice_id uuid, p_amount numeric, p_paid_on date, p_mode text, p_showroom text
)
returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  bill_status text;
  net numeric;
  collected numeric;
  line_count bigint;
  rounded_amount numeric := round(p_amount, 2);
begin
  select status into bill_status from public.invoices where id = p_invoice_id for update;
  if not found then return 'not_found'; end if;
  if bill_status = 'cancelled' then return 'cancelled'; end if;
  if rounded_amount <= 0 then return 'invalid_amount'; end if;

  select coalesce(sum(amount), 0), count(*) into net, line_count
  from public.invoice_lines where invoice_id = p_invoice_id;
  select coalesce(sum(amount), 0) into collected
  from public.payments where invoice_id = p_invoice_id and mode is distinct from 'PENDING';

  if p_amount > net - collected + 0.001 then return 'exceeds_balance'; end if;

  insert into public.payments (invoice_id, amount, paid_on, mode, showroom)
  values (p_invoice_id, rounded_amount, p_paid_on, p_mode, p_showroom);

  if p_mode is distinct from 'PENDING' then collected := collected + rounded_amount; end if;
  update public.invoices
  set status = case
    when line_count = 0 and collected = 0 then 'draft'
    when collected = 0 then 'open'
    when collected >= net then 'paid'
    else 'partial'
  end
  where id = p_invoice_id;
  return 'ok';
end;
$$;

revoke all on function public.shop_cancel_invoice(uuid, text),
  public.shop_collect_invoice(uuid, numeric, date, text, text) from public, anon, authenticated;
grant execute on function public.shop_cancel_invoice(uuid, text),
  public.shop_collect_invoice(uuid, numeric, date, text, text) to service_role;
notify pgrst, 'reload schema';

commit;
