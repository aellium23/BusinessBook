-- ============================================================
-- BusinessBook — Manual Forecast Snapshots (FCT)
-- Directors record manual forecasts at BUD/EST1/EST2 meetings
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

create table if not exists public.forecast_snapshots (
  id          uuid primary key default gen_random_uuid(),
  cycle       text not null check (cycle in ('BUD','EST1','EST2')),
  bu          text not null check (bu in ('VGT','ECT')),
  pl_key      text not null check (pl_key in ('ns_int','ns_ext')),
  apr numeric(12,3) default 0, may numeric(12,3) default 0,
  jun numeric(12,3) default 0, jul numeric(12,3) default 0,
  aug numeric(12,3) default 0, sep numeric(12,3) default 0,
  oct numeric(12,3) default 0, nov numeric(12,3) default 0,
  dec numeric(12,3) default 0, jan numeric(12,3) default 0,
  feb numeric(12,3) default 0, mar numeric(12,3) default 0,
  is_locked   boolean default false,
  notes       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

create index if not exists idx_fct_latest on public.forecast_snapshots (cycle, bu, pl_key, created_at desc);

alter table public.forecast_snapshots enable row level security;

drop policy if exists "fct read" on public.forecast_snapshots;
create policy "fct read" on public.forecast_snapshots for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true)
);

drop policy if exists "fct write" on public.forecast_snapshots;
create policy "fct write" on public.forecast_snapshots for all using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
);
