begin;

lock table public.inventory_items in share row exclusive mode;

create table public.inventory_number_counter (
  singleton boolean primary key default true check (singleton),
  last_number bigint not null,
  prefix text not null,
  digits integer not null
);

insert into public.inventory_number_counter (last_number, prefix, digits)
select coalesce(current_code.number, 0), coalesce(current_code.prefix, ''),
       coalesce(current_code.digits, 0)
from (select 1) as seed
left join lateral (
  select (parts[2])::numeric as number, parts[1] as prefix, length(parts[2]) as digits
  from public.inventory_items
  cross join lateral regexp_match(trim(inventory_no), '^(\D*)(\d+)$') as parts
  where (parts[2])::numeric <= 9007199254740991
  order by number desc, (parts[1] <> '') desc, id desc
  limit 1
) as current_code on true;

alter table public.inventory_number_counter enable row level security;
revoke all on public.inventory_number_counter from public, anon, authenticated;
grant select, update on public.inventory_number_counter to service_role;

-- Keep the allocator above manually entered and imported barcode numbers.
create function public.shop_track_inventory_number()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  suffix numeric := substring(trim(new.inventory_no) from '^\D*(\d+)$')::numeric;
begin
  if suffix between 1 and 9007199254740991 then
    update public.inventory_number_counter set last_number = suffix
    where singleton and last_number < suffix;
  end if;
  return new;
end;
$$;

create trigger shop_track_inventory_number
before insert or update of inventory_no on public.inventory_items
for each row execute function public.shop_track_inventory_number();

create function public.shop_add_stock(
  p_product_id uuid, p_count integer, p_quantity numeric, p_cost numeric,
  p_supplier_name text, p_supplier_bill_no text
)
returns table (id uuid, inventory_no text, product_id uuid, quantity numeric, status text)
language plpgsql security invoker set search_path = ''
as $$
declare
  finish bigint;
  label_prefix text;
  label_digits integer;
begin
  if p_count is null or p_count not between 1 and 200 then
    raise exception 'Invalid inventory label count';
  end if;

  update public.inventory_number_counter as c set last_number = c.last_number + p_count
  where singleton returning c.last_number, c.prefix, c.digits
  into strict finish, label_prefix, label_digits;

  return query
    with inserted as (
      insert into public.inventory_items as i (
        inventory_no, product_id, quantity, received_quantity, status,
        cost, supplier_name, supplier_bill_no
      )
      select label_prefix || lpad(n::text, greatest(label_digits, length(n::text)), '0'),
             p_product_id, p_quantity, p_quantity, 'available', p_cost, p_supplier_name, p_supplier_bill_no
      from generate_series(finish - p_count + 1, finish) as n
      returning i.id, i.inventory_no, i.product_id, i.quantity, i.status
    )
    select i.id, i.inventory_no, i.product_id, i.quantity, i.status from inserted i
    order by length(i.inventory_no), i.inventory_no collate "C";
end;
$$;

revoke all on function public.shop_add_stock(uuid, integer, numeric, numeric, text, text)
from public, anon, authenticated;
grant execute on function public.shop_add_stock(uuid, integer, numeric, numeric, text, text)
to service_role;
notify pgrst, 'reload schema';

commit;
