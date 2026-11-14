begin;

lock table public.stitching_orders in access exclusive mode;

create sequence if not exists public.stitching_order_number_seq as bigint
  owned by public.stitching_orders.order_no;

-- Preserve historical order numbers and continue above their numeric maximum.
-- Keep any numbers already reserved by the sequence if the migration is rerun.
select setval(
  'public.stitching_order_number_seq',
  greatest(
    coalesce((
      select max(order_no::numeric)
      from public.stitching_orders
      where order_no ~ '^[0-9]+$'
    ), 0) + 1,
    (select last_value::numeric + case when is_called then 1 else 0 end
     from public.stitching_order_number_seq)
  )::bigint,
  false
);

revoke all on sequence public.stitching_order_number_seq from public, anon, authenticated;
grant usage on sequence public.stitching_order_number_seq to service_role;

alter table public.stitching_orders
  alter column order_no set default nextval('public.stitching_order_number_seq')::text;

notify pgrst, 'reload schema';

commit;
