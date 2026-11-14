begin;

lock table public.invoices in access exclusive mode;

create sequence if not exists public.invoice_bill_number_seq as bigint
  owned by public.invoices.bill_no;

-- Preserve historical bill numbers and continue above their numeric maximum.
-- Keep any numbers already reserved by the sequence if the migration is rerun.
select setval(
  'public.invoice_bill_number_seq',
  greatest(
    coalesce((
      select max(bill_no::numeric)
      from public.invoices
      where bill_no ~ '^[0-9]+$'
    ), 0) + 1,
    (select last_value::numeric + case when is_called then 1 else 0 end
     from public.invoice_bill_number_seq)
  )::bigint,
  false
);

revoke all on sequence public.invoice_bill_number_seq from public, anon, authenticated;
grant usage on sequence public.invoice_bill_number_seq to service_role;

alter table public.invoices
  alter column bill_no set default nextval('public.invoice_bill_number_seq')::text;

notify pgrst, 'reload schema';

commit;
