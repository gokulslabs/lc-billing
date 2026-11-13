alter table public.payments drop constraint if exists payments_mode_check;

alter table public.payments
  add constraint payments_mode_check
  check (
    mode is null or mode in (
      'CASH',
      'UPI',
      'CHEQUE',
      'IMPS/NEFT',
      'SALES RETURN',
      'CARD',
      'MAINTENANCE',
      'PENDING',
      'GIFT'
    )
  );
