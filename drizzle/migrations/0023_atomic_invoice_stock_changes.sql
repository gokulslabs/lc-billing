begin;

create function public.shop_refresh_invoice_status(p_invoice_id uuid)
returns void
language sql security invoker set search_path = ''
as $$
  update public.invoices b
  set status = case
    when p.paid > 0 and p.paid >= l.net then 'paid'
    when p.paid > 0 then 'partial'
    when l.lines = 0 then 'draft'
    else 'open'
  end
  from (select count(*) as lines, coalesce(sum(amount), 0) as net
        from public.invoice_lines where invoice_id = p_invoice_id) l
  cross join (select coalesce(sum(amount), 0) as paid from public.payments
              where invoice_id = p_invoice_id and mode is distinct from 'PENDING') p
  where b.id = p_invoice_id and b.status <> 'cancelled';
$$;

create function public.shop_add_invoice_line(
  p_invoice_id uuid, p_customer_id uuid, p_stock_id uuid, p_product_id uuid,
  p_inventory_no text, p_expected_stock numeric, p_quantity numeric,
  p_rate numeric, p_amount numeric, p_is_piece boolean
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  line_id uuid;
begin
  perform 1 from public.invoices
  where id = p_invoice_id and customer_id = p_customer_id and status <> 'cancelled' for update;
  if not found then raise sqlstate 'PT409' using message = 'Bill changed. Reload and try again.'; end if;

  update public.inventory_items
  set quantity = quantity - p_quantity,
      status = case when quantity > p_quantity then 'available' else 'sold' end
  where id = p_stock_id and product_id = p_product_id and inventory_no = p_inventory_no
    and status = 'available' and quantity = p_expected_stock and quantity >= p_quantity;
  if not found then raise sqlstate 'PT409' using message = 'Stock changed. Try the line again.'; end if;

  if p_is_piece and exists (
    select 1 from public.invoice_lines l join public.invoices b on b.id = l.invoice_id
    where l.inventory_item_id = p_stock_id and b.status <> 'cancelled'
  ) then
    raise sqlstate 'PT409' using message = 'This piece is already on an active bill.';
  end if;

  insert into public.invoice_lines (invoice_id, inventory_item_id, product_id, inventory_no,
                                    quantity, rate, amount)
  values (p_invoice_id, p_stock_id, p_product_id, p_inventory_no, p_quantity, p_rate, p_amount)
  returning id into line_id;
  perform public.shop_refresh_invoice_status(p_invoice_id);
  return line_id;
end;
$$;

create function public.shop_return_invoice_line(
  p_invoice_id uuid, p_line_id uuid, p_expected_quantity numeric, p_expected_amount numeric,
  p_new_quantity numeric, p_new_amount numeric
)
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  stock_id uuid;
begin
  perform 1 from public.invoices where id = p_invoice_id and status <> 'cancelled' for update;
  if not found then raise sqlstate 'PT409' using message = 'Bill changed. Reload and try again.'; end if;

  select inventory_item_id into stock_id from public.invoice_lines
  where id = p_line_id and invoice_id = p_invoice_id and quantity = p_expected_quantity
    and amount = p_expected_amount for update;
  if not found then raise sqlstate 'PT409' using message = 'Bill line changed. Reload and try again.'; end if;

  if stock_id is not null then
    update public.inventory_items
    set quantity = quantity + p_expected_quantity - p_new_quantity, status = 'available'
    where id = stock_id;
    if not found then raise exception 'Could not restore stock for the return.'; end if;
  end if;

  if p_new_quantity = 0 then
    delete from public.invoice_lines where id = p_line_id;
  else
    update public.invoice_lines set quantity = p_new_quantity, amount = p_new_amount where id = p_line_id;
  end if;
  perform public.shop_refresh_invoice_status(p_invoice_id);
end;
$$;

revoke all on function public.shop_refresh_invoice_status(uuid),
  public.shop_add_invoice_line(uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, numeric, boolean),
  public.shop_return_invoice_line(uuid, uuid, numeric, numeric, numeric, numeric)
from public, anon, authenticated;
grant execute on function public.shop_refresh_invoice_status(uuid),
  public.shop_add_invoice_line(uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, numeric, boolean),
  public.shop_return_invoice_line(uuid, uuid, numeric, numeric, numeric, numeric)
to service_role;
notify pgrst, 'reload schema';

commit;
