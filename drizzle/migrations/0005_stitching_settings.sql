alter table public.stitching_products
  add column if not exists sort_order integer not null default 0;

update public.stitching_products
set sort_order = case name
  when 'BLOUSE' then 1
  when 'SUIT' then 2
  when 'LEHANGA' then 3
  when 'PREPLEATING' then 4
  else sort_order
end
where name in ('BLOUSE', 'SUIT', 'LEHANGA', 'PREPLEATING');

insert into public.stitching_measurement_fields (stitching_product_id, label, sort_order)
select p.id, v.label, v.sort_order
from public.stitching_products p
join (
  values
    ('BLOUSE', 'FRONT NECK', 1),
    ('BLOUSE', 'BACK NECK', 2),
    ('BLOUSE', 'SHOLDER', 3),
    ('BLOUSE', 'ARM HOLD', 4),
    ('BLOUSE', 'SLEEVE LENGTH', 5),
    ('BLOUSE', 'SLEEVE ROUND', 6),
    ('BLOUSE', 'BUST', 7),
    ('BLOUSE', 'CHEST', 8),
    ('BLOUSE', 'WAIST', 9),
    ('BLOUSE', 'BLOUSE LENGTH', 10),
    ('BLOUSE', 'DART POINT', 11),
    ('BLOUSE', 'PRINCES CUT / PRINCES WITH BELT', 12),
    ('BLOUSE', 'STRAIGHT CUT / CROSS CUT', 13),
    ('SUIT', 'FRONT NECK', 1),
    ('SUIT', 'BACK NECK', 2),
    ('SUIT', 'SHOLDER', 3),
    ('SUIT', 'ARM HOLD', 4),
    ('SUIT', 'SLEEVE LENGTH', 5),
    ('SUIT', 'SLEEVE ROUND', 6),
    ('SUIT', 'BUST', 7),
    ('SUIT', 'CHEST', 8),
    ('SUIT', 'WAIST', 9),
    ('SUIT', 'HIP', 10),
    ('SUIT', 'SLIT', 11),
    ('SUIT', 'TOP LENGTH', 12),
    ('SUIT', 'YOKE', 13),
    ('SUIT', 'DART POINT', 14),
    ('SUIT', 'UMBRELLA TOP LENGTH', 15),
    ('SUIT', 'FULL LENGTH', 16),
    ('SUIT', 'PANTS LENGTH', 17),
    ('SUIT', 'PANTS WAIST', 18),
    ('SUIT', 'THIGH ROUND', 19),
    ('SUIT', 'KNEE ROUND', 20),
    ('SUIT', 'PANTS ROUND', 21),
    ('SUIT', 'FROCK LENGTH', 22),
    ('LEHANGA', 'FRONT NECK', 1),
    ('LEHANGA', 'BACK NECK', 2),
    ('LEHANGA', 'SHOULDER', 3),
    ('LEHANGA', 'ARM HOLE', 4),
    ('LEHANGA', 'SLEEVE LENGTH', 5),
    ('LEHANGA', 'SLEEVE ROUND', 6),
    ('LEHANGA', 'BUST', 7),
    ('LEHANGA', 'CHEST', 8),
    ('LEHANGA', 'WAIST', 9),
    ('LEHANGA', 'HIP', 10),
    ('LEHANGA', 'DART POINT', 11),
    ('LEHANGA', 'CROP TOP LENGTH', 12),
    ('LEHANGA', 'BLOUSE LENGTH', 13),
    ('LEHANGA', 'LEHENGA LENGTH', 14),
    ('LEHANGA', 'LEHENGA WAIST', 15),
    ('LEHANGA', 'NECK ROUND', 16),
    ('LEHANGA', 'FROCK LENTH', 17),
    ('LEHANGA', 'YOKE', 18),
    ('PREPLEATING', 'PLEATS', 1),
    ('PREPLEATING', 'PLEATS SIZE', 2),
    ('PREPLEATING', 'CHEST', 3),
    ('PREPLEATING', 'CHEST LENGTH', 4),
    ('PREPLEATING', 'HIP', 5),
    ('PREPLEATING', 'CIRCUM PINNING', 6),
    ('PREPLEATING', 'PALLU', 7)
) as v(product, label, sort_order) on v.product = p.name
on conflict (stitching_product_id, label) do update
set sort_order = excluded.sort_order;
