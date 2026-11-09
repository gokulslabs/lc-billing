create view public.stock_verification_report as
select i.id, i.inventory_no, i.product_id, i.quantity, i.status,
       i.stock_verified_at, i.stock_verified_quantity,
       p.code as product_code, p.name as product_name, p.unit, p.price,
       g.name as group_name
from public.inventory_items i
join public.products p on p.id = i.product_id
join public.product_groups g on g.id = p.group_id;

revoke all on public.stock_verification_report from public, anon, authenticated;
grant select on public.stock_verification_report to service_role;
