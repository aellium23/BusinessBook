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
