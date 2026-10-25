-- The live catalogue repeats a product code (FABRICS all use FB-0001).
alter table public.products drop constraint if exists products_code_key;
