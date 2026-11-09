create table public.stock_count_rounds (
  started_at timestamptz primary key,
  started_by uuid not null,
  previous_scans jsonb not null
);

alter table public.stock_count_rounds enable row level security;
revoke all on public.stock_count_rounds from public, anon, authenticated;
grant select, insert on public.stock_count_rounds to service_role;

create function public.start_stock_count(actor uuid, expected_start timestamptz)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  started timestamptz;
begin
  perform pg_advisory_xact_lock(481937721);
  if (select max(started_at) from public.stock_count_rounds) is distinct from expected_start then
    raise exception 'A count has already started' using errcode = '40001';
  end if;
  lock table public.inventory_items in share row exclusive mode;
  started := clock_timestamp();
  insert into public.stock_count_rounds (started_at, started_by, previous_scans)
  select started, actor, coalesce(jsonb_agg(to_jsonb(report)), '[]'::jsonb)
  from public.stock_verification_report report
  where report.stock_verified_at is not null;
  update public.inventory_items
  set stock_verified_at = null, stock_verified_quantity = null
  where stock_verified_at is not null or stock_verified_quantity is not null;
  return started;
end;
$$;

revoke execute on function public.start_stock_count(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.start_stock_count(uuid, timestamptz) to service_role;
