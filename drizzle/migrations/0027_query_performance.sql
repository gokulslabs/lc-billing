begin;

-- Match the most common date ordered lists while keeping existing indexes intact.
create index if not exists invoices_billed_on_id_idx
  on public.invoices (billed_on desc, id desc);
create index if not exists invoices_customer_billed_on_id_idx
  on public.invoices (customer_id, billed_on desc, id desc);
create index if not exists inventory_items_created_at_id_idx
  on public.inventory_items (created_at desc, id desc);
create index if not exists stitching_measurements_order_sort_idx
  on public.stitching_order_measurements (order_id, sort_order, id);

-- Aggregate stock discrepancies in Postgres instead of transferring every stock,
-- invoice, and invoice-line row to the application server for each report view.
create or replace function public.shop_inventory_mismatches()
returns table (
  "inventoryNo" text,
  "productCode" text,
  "productName" text,
  received numeric,
  billed numeric,
  "onHand" numeric,
  difference numeric
)
language sql stable security invoker set search_path = ''
as $$
  with billed as (
    select l.inventory_item_id, round(sum(l.quantity), 3) as quantity
    from public.invoice_lines l
    join public.invoices i on i.id = l.invoice_id
    where l.inventory_item_id is not null
      and i.status <> 'cancelled'
    group by l.inventory_item_id
  ), discrepancies as (
    select s.inventory_no, p.code, p.name,
      s.received_quantity as received,
      coalesce(b.quantity, 0) as billed,
      s.quantity as on_hand,
      round(
        s.quantity - round(s.received_quantity - coalesce(b.quantity, 0), 3),
        3
      ) as difference
    from public.inventory_items s
    join public.products p on p.id = s.product_id
    left join billed b on b.inventory_item_id = s.id
  )
  select d.inventory_no, d.code, d.name, d.received, d.billed, d.on_hand, d.difference
  from discrepancies d
  where d.difference <> 0
  order by d.inventory_no;
$$;

revoke all on function public.shop_inventory_mismatches() from public, anon, authenticated;
grant execute on function public.shop_inventory_mismatches() to service_role;
notify pgrst, 'reload schema';

commit;
