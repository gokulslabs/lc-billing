begin;

alter table public.invoice_lines
  add column if not exists product_code text,
  add column if not exists product_name text,
  add column if not exists group_name text;

create table if not exists public.shop_operations (
  idempotency_key text primary key,
  request_hash text not null,
  invoice_id uuid,
  operation text not null,
  result_id uuid,
  result_status text,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  record_table text not null,
  record_id uuid,
  detail jsonb not null default '{}'::jsonb
);

alter table public.shop_operations enable row level security;
alter table public.shop_audit enable row level security;

revoke all on public.shop_operations, public.shop_audit from public, anon, authenticated;
grant select, insert on public.shop_operations, public.shop_audit to service_role;

create or replace function public.shop_audit_frozen()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Audit records cannot be changed.';
end;
$$;

drop trigger if exists shop_audit_no_change on public.shop_audit;
create trigger shop_audit_no_change
  before update or delete on public.shop_audit
  for each row execute function public.shop_audit_frozen();

create or replace function public.shop_operation_state(p_key text, p_hash text)
returns text
language plpgsql
as $$
declare
  existing_hash text;
begin
  if p_key is null or length(p_key) < 8 then
    raise sqlstate 'PT409' using message = 'Enter an operation id.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));
  select request_hash into existing_hash from public.shop_operations where idempotency_key = p_key;
  if not found then return 'new'; end if;
  if existing_hash is distinct from p_hash then
    raise sqlstate 'PT409' using message = 'This operation id was already used for a different sale.';
  end if;
  return 'replay';
end;
$$;

create or replace function public.shop_add_invoice_line(
  p_invoice_id uuid, p_customer_id uuid, p_stock_id uuid, p_product_id uuid,
  p_inventory_no text, p_expected_stock numeric, p_quantity numeric,
  p_rate numeric, p_amount numeric, p_is_piece boolean
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  line_id uuid;
  snap_code text;
  snap_name text;
  snap_group text;
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

  select p.code, p.name, g.name into snap_code, snap_name, snap_group
  from public.products p
  join public.product_groups g on g.id = p.group_id
  where p.id = p_product_id;

  insert into public.invoice_lines (
    invoice_id, inventory_item_id, product_id, inventory_no, quantity, rate, amount,
    product_code, product_name, group_name
  )
  values (
    p_invoice_id, p_stock_id, p_product_id, p_inventory_no, p_quantity, p_rate, p_amount,
    snap_code, snap_name, snap_group
  )
  returning id into line_id;
  perform public.shop_refresh_invoice_status(p_invoice_id);
  return line_id;
end;
$$;

create or replace function public.shop_add_invoice_line_once(
  p_key text, p_hash text, p_actor uuid,
  p_invoice_id uuid, p_customer_id uuid, p_stock_id uuid, p_product_id uuid,
  p_inventory_no text, p_expected_stock numeric, p_quantity numeric,
  p_rate numeric, p_amount numeric, p_is_piece boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  line_id uuid;
  state text;
begin
  state := public.shop_operation_state(p_key, p_hash);
  if state = 'replay' then
    select result_id into line_id from public.shop_operations where idempotency_key = p_key;
    return line_id;
  end if;
  line_id := public.shop_add_invoice_line(
    p_invoice_id, p_customer_id, p_stock_id, p_product_id, p_inventory_no,
    p_expected_stock, p_quantity, p_rate, p_amount, p_is_piece
  );
  insert into public.shop_operations (idempotency_key, request_hash, invoice_id, operation, result_id, result_status)
  values (p_key, p_hash, p_invoice_id, 'add_line', line_id, 'ok');
  insert into public.shop_audit (actor_id, action, record_table, record_id, detail)
  values (
    p_actor, 'sale_line', 'invoice_lines', line_id,
    jsonb_build_object('invoice_id', p_invoice_id, 'inventory_no', p_inventory_no, 'quantity', p_quantity, 'amount', p_amount)
  );
  return line_id;
end;
$$;

create or replace function public.shop_collect_invoice_once(
  p_key text, p_hash text, p_actor uuid,
  p_invoice_id uuid, p_amount numeric, p_paid_on date, p_mode text, p_showroom text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  outcome text;
  state text;
begin
  state := public.shop_operation_state(p_key, p_hash);
  if state = 'replay' then return 'ok'; end if;
  outcome := public.shop_collect_invoice(p_invoice_id, p_amount, p_paid_on, p_mode, p_showroom);
  if outcome = 'ok' then
    insert into public.shop_operations (idempotency_key, request_hash, invoice_id, operation, result_status)
    values (p_key, p_hash, p_invoice_id, 'collect', 'ok');
    insert into public.shop_audit (actor_id, action, record_table, record_id, detail)
    values (
      p_actor, 'payment', 'invoices', p_invoice_id,
      jsonb_build_object('amount', p_amount, 'mode', p_mode, 'paid_on', p_paid_on)
    );
  end if;
  return outcome;
end;
$$;

create or replace function public.shop_return_invoice_line_once(
  p_key text, p_hash text, p_actor uuid,
  p_invoice_id uuid, p_line_id uuid, p_expected_quantity numeric, p_expected_amount numeric,
  p_new_quantity numeric, p_new_amount numeric
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_hash text;
begin
  if p_key is null or length(p_key) < 8 then
    raise sqlstate 'PT409' using message = 'Enter an operation id.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));
  select request_hash into existing_hash from public.shop_operations where idempotency_key = p_key;
  if found then
    if existing_hash is distinct from p_hash then
      raise sqlstate 'PT409' using message = 'This operation id was already used for a different sale.';
    end if;
    return 'ok';
  end if;
  perform public.shop_return_invoice_line(
    p_invoice_id, p_line_id, p_expected_quantity, p_expected_amount, p_new_quantity, p_new_amount
  );
  insert into public.shop_operations (idempotency_key, request_hash, invoice_id, operation, result_id, result_status)
  values (p_key, p_hash, p_invoice_id, 'return', p_line_id, 'ok');
  insert into public.shop_audit (actor_id, action, record_table, record_id, detail)
  values (
    p_actor, 'return', 'invoice_lines', p_line_id,
    jsonb_build_object('invoice_id', p_invoice_id, 'quantity', p_new_quantity, 'amount', p_new_amount)
  );
  return 'ok';
end;
$$;

revoke all on function
  public.shop_operation_state(text, text),
  public.shop_add_invoice_line_once(text, text, uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, numeric, boolean),
  public.shop_collect_invoice_once(text, text, uuid, uuid, numeric, date, text, text),
  public.shop_return_invoice_line_once(text, text, uuid, uuid, uuid, numeric, numeric, numeric, numeric),
  public.shop_audit_frozen()
from public, anon, authenticated;

grant execute on function
  public.shop_add_invoice_line_once(text, text, uuid, uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, numeric, boolean),
  public.shop_collect_invoice_once(text, text, uuid, uuid, numeric, date, text, text),
  public.shop_return_invoice_line_once(text, text, uuid, uuid, uuid, numeric, numeric, numeric, numeric)
to service_role;

notify pgrst, 'reload schema';

commit;
