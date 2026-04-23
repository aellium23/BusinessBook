-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-14
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Add product-level sub-targets to quotas (JSONB: { "Product": amount })
alter table if exists public.quotas
  add column if not exists sub_targets jsonb default '{}'::jsonb;

comment on column public.quotas.sub_targets is
  'Breakdown of target_eur per product family, e.g. {"CWM Dose": 1000000, "AI Reporting": 500000}';

-- 2. Tighten RLS on deals: viewers should only see their own BU
--    (previously any viewer could read every deal in both BUs)
do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='deals' and policyname='viewer read all'
  ) then
    drop policy "viewer read all" on public.deals;
  end if;
end $$;

drop policy if exists "viewer read own bu" on public.deals;
create policy "viewer read own bu" on public.deals for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'viewer'
      and (
        p.bu is null -- viewers without a BU assigned fall back to no access
          and false
        or p.bu = deals.bu
      )
  )
);

-- 3. Tighten RLS on budget: only admins + users of the same BU may read
drop policy if exists "all read budget" on public.budget;
drop policy if exists "bu read budget" on public.budget;
create policy "bu read budget" on public.budget for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.bu = budget.bu)
  )
);
-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-15
--   • Attachments for deals + tenders (Supabase Storage backed)
--   • Tender requirements matrix
--   • Tender requirement templates (seeded with medical-imaging defaults)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Storage bucket for attachments
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Bucket policies: authenticated users can read/write under their visibility rules.
-- We rely on the attachments table RLS for fine-grained access; storage policies
-- allow any authenticated user to read/write objects in this bucket, since
-- path-level checks against deals/tenders would require re-implementing RLS here.
drop policy if exists "authenticated read attachments" on storage.objects;
create policy "authenticated read attachments"
  on storage.objects for select
  using (bucket_id = 'attachments' and auth.uid() is not null);

drop policy if exists "authenticated write attachments" on storage.objects;
create policy "authenticated write attachments"
  on storage.objects for insert
  with check (bucket_id = 'attachments' and auth.uid() is not null);

drop policy if exists "authenticated delete attachments" on storage.objects;
create policy "authenticated delete attachments"
  on storage.objects for delete
  using (bucket_id = 'attachments' and auth.uid() is not null);

-- ------------------------------------------------------------
-- 2. attachments (metadata table)
-- ------------------------------------------------------------
create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in ('deal','tender')),
  entity_id    uuid not null,
  storage_path text not null,
  file_name    text not null,
  size_bytes   bigint not null,
  mime_type    text,
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now()
);

create index if not exists attachments_entity_idx
  on public.attachments (entity_type, entity_id);

alter table public.attachments enable row level security;

-- Read: admins see everything; everyone else inherits visibility from the parent
-- deal/tender (so RLS of deals/tenders flows through).
drop policy if exists "attachments read" on public.attachments;
create policy "attachments read" on public.attachments for select using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  or (entity_type = 'deal'   and exists (select 1 from public.deals   d where d.id = entity_id))
  or (entity_type = 'tender' and exists (select 1 from public.tenders t where t.id = entity_id))
);

drop policy if exists "attachments insert" on public.attachments;
create policy "attachments insert" on public.attachments for insert
  with check (auth.uid() is not null and uploaded_by = auth.uid());

drop policy if exists "attachments delete" on public.attachments;
create policy "attachments delete" on public.attachments for delete using (
  uploaded_by = auth.uid()
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- ------------------------------------------------------------
-- 3. tender_requirements
-- ------------------------------------------------------------
create table if not exists public.tender_requirements (
  id           uuid primary key default gen_random_uuid(),
  tender_id    uuid not null references public.tenders(id) on delete cascade,
  title        text not null,
  description  text,
  category     text not null default 'other'
                 check (category in ('regulatory','technical','commercial','administrative','other')),
  status       text not null default 'pending'
                 check (status in ('pending','in_progress','complete','na')),
  assignee_id  uuid references auth.users(id) on delete set null,
  due_date     date,
  notes        text,
  sort_order   int not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists tender_requirements_tender_idx
  on public.tender_requirements (tender_id);

drop trigger if exists tender_requirements_updated_at on public.tender_requirements;
create trigger tender_requirements_updated_at
  before update on public.tender_requirements
  for each row execute procedure public.set_updated_at();

alter table public.tender_requirements enable row level security;

drop policy if exists "tender_requirements read" on public.tender_requirements;
create policy "tender_requirements read" on public.tender_requirements for select using (
  exists (select 1 from public.tenders t where t.id = tender_id)
);

drop policy if exists "tender_requirements write" on public.tender_requirements;
create policy "tender_requirements write" on public.tender_requirements for all using (
  exists (select 1 from public.tenders t where t.id = tender_id)
) with check (
  exists (select 1 from public.tenders t where t.id = tender_id)
);

-- ------------------------------------------------------------
-- 4. tender_requirement_templates (catalogue)
-- ------------------------------------------------------------
create table if not exists public.tender_requirement_templates (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  category     text not null default 'other'
                 check (category in ('regulatory','technical','commercial','administrative','other')),
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz default now()
);

alter table public.tender_requirement_templates enable row level security;

drop policy if exists "templates read" on public.tender_requirement_templates;
create policy "templates read" on public.tender_requirement_templates for select
  using (auth.uid() is not null);

drop policy if exists "templates admin write" on public.tender_requirement_templates;
create policy "templates admin write" on public.tender_requirement_templates for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- Seed default templates for medical imaging tenders.
-- Only inserted when the table is empty so re-runs don't duplicate rows.
insert into public.tender_requirement_templates (title, description, category, sort_order)
select * from (values
  -- Regulatory
  ('CE Marking (MDR 2017/745)',       'Provide current CE Declaration of Conformity under the Medical Device Regulation.', 'regulatory', 10),
  ('ISO 13485 Certificate',           'Current ISO 13485 certificate for the manufacturer / vendor.',                      'regulatory', 20),
  ('ISO 9001 Certificate',            'Current ISO 9001 quality-management certificate.',                                   'regulatory', 30),
  ('GDPR / Data Protection',          'Data-processing agreement and GDPR compliance statement.',                           'regulatory', 40),
  ('DICOM Conformance Statement',     'Official DICOM conformance statement for the proposed system.',                      'regulatory', 50),
  ('HL7 / FHIR Interoperability',     'Supported HL7 v2 / FHIR resources and integration profiles.',                        'regulatory', 60),
  ('Cybersecurity (IEC 62443 / NIS2)','Security architecture statement, patch policy, incident response plan.',             'regulatory', 70),

  -- Technical
  ('System Architecture Document',    'High-level architecture, components, hosting (on-prem / cloud / hybrid).',           'technical', 110),
  ('Hardware Requirements',           'Minimum and recommended hardware specs for each deployment tier.',                   'technical', 120),
  ('PACS / RIS / HIS Integration',    'Supported integration patterns and tested vendor matrix.',                           'technical', 130),
  ('AI Model Validation',             'Clinical validation evidence for AI components (if applicable).',                    'technical', 140),
  ('Performance & SLA',               'Expected throughput, latency, uptime targets and measurement method.',               'technical', 150),
  ('Backup & Disaster Recovery',      'RPO / RTO targets and backup strategy.',                                             'technical', 160),
  ('Training Plan',                   'On-site / remote training package and hand-off deliverables.',                       'technical', 170),

  -- Commercial
  ('Pricing Breakdown',               'Itemised pricing: licenses, services, hardware, maintenance.',                       'commercial', 210),
  ('Payment Terms',                   'Milestones, invoicing schedule, currency.',                                          'commercial', 220),
  ('Warranty Period',                 'Warranty scope and duration.',                                                       'commercial', 230),
  ('Maintenance Plan',                'Scope, response times, included vs billable work.',                                  'commercial', 240),
  ('Reference Clients',               'At least 3 comparable customer references with contact details.',                   'commercial', 250),
  ('Financial Statements',            'Last 3 audited financial statements.',                                               'commercial', 260),
  ('Bank Guarantee',                  'Bid bond / performance bond if required by the tender.',                             'commercial', 270),

  -- Administrative
  ('Company Registration',            'Commercial registry extract / certificate of incorporation.',                        'administrative', 310),
  ('Tax Compliance Certificate',      'Up-to-date certificate of no tax arrears.',                                          'administrative', 320),
  ('Social Security Compliance',      'Up-to-date social security clearance.',                                              'administrative', 330),
  ('Insurance Coverage',              'Professional liability and product liability insurance certificates.',                'administrative', 340),
  ('NDA Signed',                      'Non-disclosure agreement countersigned by both parties.',                            'administrative', 350),
  ('Subcontractor Disclosure',        'List of subcontractors and their roles, if any.',                                    'administrative', 360)
) as seed(title, description, category, sort_order)
where not exists (select 1 from public.tender_requirement_templates);
-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-16
--   • forecast_category on deals (Commit / BestCase / Upside / Omit)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Add the column with a permissive check constraint
alter table if exists public.deals
  add column if not exists forecast_category text;

-- 2. Add check constraint only if it doesn't already exist
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_forecast_category_check'
  ) then
    alter table public.deals
      add constraint deals_forecast_category_check
      check (forecast_category is null or forecast_category in
        ('commit','best_case','upside','omit'));
  end if;
end $$;

comment on column public.deals.forecast_category is
  'Sales-owner forecast call for this deal: commit | best_case | upside | omit. '
  'NULL means "derive from stage" on the client side.';

-- 3. Backfill: derive a sensible default from the current stage so the
--    Commit/BestCase/Upside totals aren't empty right after the migration.
--    Only touches rows that are still NULL — this is idempotent.
update public.deals set forecast_category = case stage
  when 'BackLog'          then 'commit'
  when 'Invoiced'         then 'commit'
  when 'Offer Presented'  then 'best_case'
  when 'Pipeline'         then 'upside'
  when 'Lead'             then 'omit'
  when 'Lost'             then 'omit'
  else 'upside'
end
where forecast_category is null;

-- 4. Small index to speed up forecast roll-ups by BU + category
create index if not exists deals_bu_forecast_idx
  on public.deals (bu, forecast_category);
-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-17
--   • contacts table (people per client/account)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  bu           text not null check (bu in ('VGT','ECT')),
  client_name  text not null,
  full_name    text not null,
  role_type    text not null default 'other'
                 check (role_type in ('decision_maker','champion','influencer','user','blocker','other')),
  job_title    text,
  email        text,
  phone        text,
  notes        text,
  is_primary   boolean not null default false,
  country      text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

comment on column public.contacts.role_type is
  'Stakeholder role in the decision-making unit: decision_maker | champion | influencer | user | blocker | other';

-- Fast lookup by client (case-insensitive)
create index if not exists contacts_bu_client_idx
  on public.contacts (bu, lower(client_name));

create index if not exists contacts_name_idx
  on public.contacts (lower(full_name));

-- Reuse existing set_updated_at() trigger helper
drop trigger if exists contacts_updated_at on public.contacts;
create trigger contacts_updated_at
  before update on public.contacts
  for each row execute procedure public.set_updated_at();

-- RLS: read by BU; admin reads all; write within your BU
alter table public.contacts enable row level security;

drop policy if exists "contacts read" on public.contacts;
create policy "contacts read" on public.contacts for select using (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = contacts.bu)
);

drop policy if exists "contacts write" on public.contacts;
create policy "contacts write" on public.contacts for all using (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = contacts.bu)
) with check (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = contacts.bu)
);
-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-18 (audit log)
--   • Generic audit_log + trigger function
--   • Triggers on deals, contacts, tenders, tender_requirements,
--     quotas, attachments
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.audit_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  action       text not null check (action in ('insert','update','delete')),
  table_name   text not null,
  record_id    uuid,
  changed      jsonb, -- { "field": { "old": ..., "new": ... }, ... }
  snapshot     jsonb  -- full new row on insert; full old row on delete
);

create index if not exists audit_log_time_idx  on public.audit_log (at desc);
create index if not exists audit_log_table_idx on public.audit_log (table_name, at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, at desc);
create index if not exists audit_log_record_idx on public.audit_log (record_id);

-- RLS: admin-only read. Writes happen via SECURITY DEFINER trigger, so no
-- INSERT policy is needed (RLS is bypassed for the trigger function).
alter table public.audit_log enable row level security;

drop policy if exists "audit read admins" on public.audit_log;
create policy "audit read admins" on public.audit_log for select using (
  auth.uid() in (select id from public.profiles where role = 'admin')
);

-- ------------------------------------------------------------
-- Generic audit trigger
-- ------------------------------------------------------------
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer as $$
declare
  v_changed jsonb;
  v_snapshot jsonb;
  v_rec_id uuid;
  v_email text;
begin
  -- Try to record which user made the change; may be NULL in system contexts.
  select email into v_email from auth.users where id = auth.uid();

  if (tg_op = 'INSERT') then
    v_snapshot := to_jsonb(new);
    v_rec_id := nullif(v_snapshot->>'id','')::uuid;
    insert into public.audit_log(actor_id, actor_email, action, table_name, record_id, snapshot)
    values (auth.uid(), v_email, 'insert', tg_table_name, v_rec_id, v_snapshot);
    return new;

  elsif (tg_op = 'UPDATE') then
    v_rec_id := nullif(to_jsonb(new)->>'id','')::uuid;
    -- Diff: union of keys from old+new, keeping only those where the value
    -- actually changed. Skip noisy fields that change on every write.
    select jsonb_object_agg(
      k.key,
      jsonb_build_object('old', to_jsonb(old) -> k.key, 'new', to_jsonb(new) -> k.key)
    )
      into v_changed
      from (
        select jsonb_object_keys(to_jsonb(new)) as key
        union
        select jsonb_object_keys(to_jsonb(old)) as key
      ) k
      where (to_jsonb(old) -> k.key) is distinct from (to_jsonb(new) -> k.key)
        and k.key not in ('updated_at','stage_changed_at');

    -- If nothing changed in meaningful fields, don't write a log row.
    if v_changed is not null then
      insert into public.audit_log(actor_id, actor_email, action, table_name, record_id, changed)
      values (auth.uid(), v_email, 'update', tg_table_name, v_rec_id, v_changed);
    end if;
    return new;

  elsif (tg_op = 'DELETE') then
    v_snapshot := to_jsonb(old);
    v_rec_id := nullif(v_snapshot->>'id','')::uuid;
    insert into public.audit_log(actor_id, actor_email, action, table_name, record_id, snapshot)
    values (auth.uid(), v_email, 'delete', tg_table_name, v_rec_id, v_snapshot);
    return old;
  end if;

  return null;
end;
$$;

-- ------------------------------------------------------------
-- Attach triggers to key tables
-- ------------------------------------------------------------
drop trigger if exists audit_deals on public.deals;
create trigger audit_deals
  after insert or update or delete on public.deals
  for each row execute procedure public.audit_trigger();

drop trigger if exists audit_contacts on public.contacts;
create trigger audit_contacts
  after insert or update or delete on public.contacts
  for each row execute procedure public.audit_trigger();

drop trigger if exists audit_tenders on public.tenders;
create trigger audit_tenders
  after insert or update or delete on public.tenders
  for each row execute procedure public.audit_trigger();

drop trigger if exists audit_tender_requirements on public.tender_requirements;
create trigger audit_tender_requirements
  after insert or update or delete on public.tender_requirements
  for each row execute procedure public.audit_trigger();

drop trigger if exists audit_quotas on public.quotas;
create trigger audit_quotas
  after insert or update or delete on public.quotas
  for each row execute procedure public.audit_trigger();

drop trigger if exists audit_attachments on public.attachments;
create trigger audit_attachments
  after insert or update or delete on public.attachments
  for each row execute procedure public.audit_trigger();
-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-18 (accounts)
--   • accounts table (with self-ref parent for hierarchy)
--   • deals.account_id (optional FK — keeps deals.client string)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.accounts (
  id           uuid primary key default gen_random_uuid(),
  bu           text not null check (bu in ('VGT','ECT')),
  name         text not null,
  parent_id    uuid references public.accounts(id) on delete set null,
  country      text,
  region       text,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists accounts_bu_name_idx on public.accounts (bu, lower(name));
create index if not exists accounts_parent_idx  on public.accounts (parent_id);

drop trigger if exists accounts_updated_at on public.accounts;
create trigger accounts_updated_at
  before update on public.accounts
  for each row execute procedure public.set_updated_at();

-- RLS: read within BU, write within BU (admins see/write all)
alter table public.accounts enable row level security;

drop policy if exists "accounts read" on public.accounts;
create policy "accounts read" on public.accounts for select using (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = accounts.bu)
);

drop policy if exists "accounts write" on public.accounts;
create policy "accounts write" on public.accounts for all using (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = accounts.bu)
) with check (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = accounts.bu)
);

-- Link deals to accounts (optional — existing string `client` stays authoritative
-- for display until you migrate). Setting null on delete keeps deals safe.
alter table if exists public.deals
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists deals_account_idx on public.deals (account_id);
-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-19 (distribution network)
--   • regional_hubs  (e.g. HCUS)
--   • distributors   (e.g. Ajoveco in Colombia, linked to HCUS)
--   • deals: distribution_path + structured FKs + price levels
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- regional_hubs
-- ------------------------------------------------------------
create table if not exists public.regional_hubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  region      text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create unique index if not exists regional_hubs_name_idx
  on public.regional_hubs (lower(name));

drop trigger if exists regional_hubs_updated_at on public.regional_hubs;
create trigger regional_hubs_updated_at
  before update on public.regional_hubs
  for each row execute procedure public.set_updated_at();

alter table public.regional_hubs enable row level security;

drop policy if exists "hubs read" on public.regional_hubs;
create policy "hubs read" on public.regional_hubs for select
  using (auth.uid() is not null);

drop policy if exists "hubs admin write" on public.regional_hubs;
create policy "hubs admin write" on public.regional_hubs for all using (
  auth.uid() in (select id from public.profiles where role = 'admin')
) with check (
  auth.uid() in (select id from public.profiles where role = 'admin')
);

-- ------------------------------------------------------------
-- distributors
-- ------------------------------------------------------------
create table if not exists public.distributors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  country     text,
  region      text,
  hub_id      uuid references public.regional_hubs(id) on delete set null,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists distributors_country_idx on public.distributors (lower(country));
create index if not exists distributors_hub_idx     on public.distributors (hub_id);
create unique index if not exists distributors_name_country_idx
  on public.distributors (lower(name), coalesce(lower(country),''));

drop trigger if exists distributors_updated_at on public.distributors;
create trigger distributors_updated_at
  before update on public.distributors
  for each row execute procedure public.set_updated_at();

alter table public.distributors enable row level security;

drop policy if exists "distributors read" on public.distributors;
create policy "distributors read" on public.distributors for select
  using (auth.uid() is not null);

drop policy if exists "distributors write" on public.distributors;
create policy "distributors write" on public.distributors for all using (
  auth.uid() in (select id from public.profiles where role in ('admin'))
  or auth.uid() in (select id from public.profiles where role = 'manager')
) with check (
  auth.uid() in (select id from public.profiles where role in ('admin'))
  or auth.uid() in (select id from public.profiles where role = 'manager')
);

-- ------------------------------------------------------------
-- deals: distribution_path + structured FKs + price levels
-- ------------------------------------------------------------
alter table if exists public.deals
  add column if not exists distribution_path  text,
  add column if not exists distributor_id     uuid references public.distributors(id)   on delete set null,
  add column if not exists hub_id             uuid references public.regional_hubs(id) on delete set null,
  add column if not exists vgt_cost           numeric(14,2),
  add column if not exists distributor_price  numeric(14,2),
  add column if not exists end_customer_price numeric(14,2);

-- Add constraint (separate so re-runs don't fail)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deals_distribution_path_check'
  ) then
    alter table public.deals
      add constraint deals_distribution_path_check
      check (distribution_path is null or distribution_path in ('direct','hub_mediated'));
  end if;
end $$;

comment on column public.deals.distribution_path is
  'direct = VGT → Distributor → Client; hub_mediated = VGT → Hub → Distributor → Client';
comment on column public.deals.vgt_cost is
  'What this deal costs VGT to produce (cost of goods). value_total - vgt_cost = VGT margin.';
comment on column public.deals.distributor_price is
  'hub_mediated: price the hub charges the distributor. direct: same as value_total (redundant).';
comment on column public.deals.end_customer_price is
  'What the distributor charges the end customer. Used to compute distributor margin.';

create index if not exists deals_distributor_idx on public.deals (distributor_id);
create index if not exists deals_hub_idx         on public.deals (hub_id);
