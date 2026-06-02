-- BusinessBook — App Settings table
create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "settings read" on public.app_settings;
create policy "settings read" on public.app_settings for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true)
);

drop policy if exists "settings write" on public.app_settings;
create policy "settings write" on public.app_settings for all using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
);

-- Insert default settings
insert into public.app_settings (config) values ('{
  "company_name": "Business Book",
  "company_subtitle": "by Elio Santos · Powered by AI",
  "primary_color": "#0D2137",
  "fy_start_month": 4,
  "business_units": [
    {"id": "VGT", "label": "VGT · Portugal", "color": "#1D9E75"},
    {"id": "ECT", "label": "ECT · Spain", "color": "#D85A30"}
  ],
  "budget_cycles": ["BUD", "EST1", "EST2"],
  "default_currency": "EUR",
  "available_currencies": ["EUR", "USD", "GBP"]
}'::jsonb)
on conflict do nothing;
