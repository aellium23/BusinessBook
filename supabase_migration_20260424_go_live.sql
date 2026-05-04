-- BusinessBook — Go-Live date fields on deals
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='deals' and column_name='go_live_month') then
    alter table public.deals add column go_live_month text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='deals' and column_name='go_live_year') then
    alter table public.deals add column go_live_year int;
  end if;
end $$;
