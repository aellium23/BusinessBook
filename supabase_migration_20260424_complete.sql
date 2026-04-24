-- ============================================================
-- BusinessBook FY26 — Complete Migration 2026-04-24
-- SLAs + Products + SLA Products + SLA Usage
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

-- ┌─────────────────────────────────────────────┐
-- │ 1. ALTER slas — add billing model fields    │
-- └─────────────────────────────────────────────┘

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='slas' and column_name='billing_model') then
    alter table public.slas add column billing_model text default 'fixed' check (billing_model in ('fixed','pay_per_study_variable','pay_per_study_estimated'));
  end if;
  if not exists (select 1 from information_schema.columns where table_name='slas' and column_name='price_per_study') then
    alter table public.slas add column price_per_study numeric(10,2);
  end if;
  if not exists (select 1 from information_schema.columns where table_name='slas' and column_name='estimated_annual_studies') then
    alter table public.slas add column estimated_annual_studies int;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='slas' and column_name='billing_frequency') then
    alter table public.slas add column billing_frequency text default 'annual' check (billing_frequency in ('monthly','quarterly','semi_annual','annual'));
  end if;
end $$;

-- ┌─────────────────────────────────────────────┐
-- │ 2. products — Product Catalog               │
-- └─────────────────────────────────────────────┘

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  category          text not null,
  sku               text,
  name              text not null,
  description       text,
  license_fee       numeric(12,2) default 0,
  annual_fee        numeric(12,2) default 0,
  pricing_model     text default 'license_plus_annual'
                      check (pricing_model in ('license_plus_annual','subscription','pay_per_study','saas')),
  bu                text not null default 'VGT' check (bu in ('VGT','ECT')),
  active            boolean default true,
  distributor_visible boolean default true,
  sort_order        int default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists products_category_idx on public.products (category);
create index if not exists products_bu_idx on public.products (bu, active);

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at
  before update on public.products
  for each row execute procedure public.set_updated_at();

alter table public.products enable row level security;

drop policy if exists "products read" on public.products;
create policy "products read" on public.products for select using (true);

drop policy if exists "products write" on public.products;
create policy "products write" on public.products for all using (
  auth.uid() in (select id from public.profiles where role = 'admin')
) with check (
  auth.uid() in (select id from public.profiles where role = 'admin')
);

-- ┌─────────────────────────────────────────────┐
-- │ 3. sla_products — Products per SLA          │
-- └─────────────────────────────────────────────┘

create table if not exists public.sla_products (
  id                uuid primary key default gen_random_uuid(),
  sla_id            uuid not null references public.slas(id) on delete cascade,
  product_id        uuid references public.products(id) on delete set null,
  product_name      text,
  quantity          int default 1,
  contracted_volume int,
  unit_price        numeric(12,2),
  annual_value      numeric(12,2),
  notes             text,
  created_at        timestamptz default now()
);

create index if not exists sla_products_sla_idx on public.sla_products (sla_id);

alter table public.sla_products enable row level security;

drop policy if exists "sla_products read" on public.sla_products;
create policy "sla_products read" on public.sla_products for select using (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or sla_id in (select id from public.slas where bu in (
    select bu from public.profiles where id = auth.uid()
  ))
);

drop policy if exists "sla_products write" on public.sla_products;
create policy "sla_products write" on public.sla_products for all using (
  auth.uid() in (select id from public.profiles where role in ('admin','manager'))
) with check (
  auth.uid() in (select id from public.profiles where role in ('admin','manager'))
);

-- ┌─────────────────────────────────────────────┐
-- │ 4. sla_usage — Production Tracking          │
-- └─────────────────────────────────────────────┘

create table if not exists public.sla_usage (
  id                uuid primary key default gen_random_uuid(),
  sla_id            uuid not null references public.slas(id) on delete cascade,
  sla_product_id    uuid references public.sla_products(id) on delete set null,
  period_start      date not null,
  period_end        date not null,
  contracted_volume int,
  actual_volume     int default 0,
  overage           int generated always as (greatest(actual_volume - contracted_volume, 0)) stored,
  overage_value     numeric(12,2),
  notes             text,
  recorded_by       uuid references auth.users(id),
  created_at        timestamptz default now()
);

create index if not exists sla_usage_sla_idx on public.sla_usage (sla_id);
create index if not exists sla_usage_period_idx on public.sla_usage (period_start, period_end);

alter table public.sla_usage enable row level security;

drop policy if exists "sla_usage read" on public.sla_usage;
create policy "sla_usage read" on public.sla_usage for select using (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or sla_id in (select id from public.slas where bu in (
    select bu from public.profiles where id = auth.uid()
  ))
);

drop policy if exists "sla_usage write" on public.sla_usage;
create policy "sla_usage write" on public.sla_usage for all using (
  auth.uid() in (select id from public.profiles where role in ('admin','manager'))
) with check (
  auth.uid() in (select id from public.profiles where role in ('admin','manager'))
);

-- Audit triggers
drop trigger if exists audit_products on public.products;
create trigger audit_products
  after insert or update or delete on public.products
  for each row execute procedure public.audit_trigger();

drop trigger if exists audit_sla_products on public.sla_products;
create trigger audit_sla_products
  after insert or update or delete on public.sla_products
  for each row execute procedure public.audit_trigger();

drop trigger if exists audit_sla_usage on public.sla_usage;
create trigger audit_sla_usage
  after insert or update or delete on public.sla_usage
  for each row execute procedure public.audit_trigger();

-- ┌─────────────────────────────────────────────┐
-- │ 5. SEED — Product Catalog (VGT Pricelist)   │
-- └─────────────────────────────────────────────┘

insert into public.products (category, sku, name, description, license_fee, annual_fee, pricing_model, bu, sort_order)
values
-- ── Synapse 3D Packages ──
('Synapse 3D', 'S3D-BASE-1CCU',   'S3D Base Standalone 1CCU',          'Base package (Standalone)',         6494,  1042, 'license_plus_annual', 'VGT', 10),
('Synapse 3D', 'S3D-BASE-3CCU',   'S3D Base Server 3CCU',              'Base package (Server) 3CCU',      11213,  1631, 'license_plus_annual', 'VGT', 11),
('Synapse 3D', 'S3D-BASE-10CCU',  'S3D Base Server 10CCU',             'Base package (Server) 10CCU',     17250,  2538, 'license_plus_annual', 'VGT', 12),
('Synapse 3D', 'S3D-RAD-3CCU',    'S3D Radiology 3CCU',                'Radiology package 3CCU',          11360,  1631, 'license_plus_annual', 'VGT', 13),
('Synapse 3D', 'S3D-RAD-10CCU',   'S3D Radiology 10CCU',               'Radiology package 10CCU',         20352,  2538, 'license_plus_annual', 'VGT', 14),
('Synapse 3D', 'S3D-RADENT-3CCU', 'S3D Radiology Enterprise 3CCU',     'Radiology Enterprise 3CCU',       42393,  6061, 'license_plus_annual', 'VGT', 15),
('Synapse 3D', 'S3D-RADENT-10CCU','S3D Radiology Enterprise 10CCU',    'Radiology Enterprise 10CCU',      67461,  9525, 'license_plus_annual', 'VGT', 16),
('Synapse 3D', 'S3D-CARDCT-1CCU', 'S3D Cardiology CT 1CCU',            'Cardiology CT package',           15114,  1893, 'license_plus_annual', 'VGT', 17),
('Synapse 3D', 'S3D-CARDMR-1CCU', 'S3D Cardiology MR 1CCU',            'Cardiology MR package',           12606,  1013, 'license_plus_annual', 'VGT', 18),
('Synapse 3D', 'S3D-HPB-1CCU',    'S3D HPB Surgery 1CCU',              'HPB Surgery package',             14457,  1308, 'license_plus_annual', 'VGT', 19),
('Synapse 3D', 'S3D-THOR-1CCU',   'S3D Thoracic Surgery 1CCU',         'Thoracic Surgery package',        15523,  1308, 'license_plus_annual', 'VGT', 20),
('Synapse 3D', 'S3D-URO-1CCU',    'S3D Urology 1CCU',                  'Urology package',                 12650,  1308, 'license_plus_annual', 'VGT', 21),
('Synapse 3D', 'S3D-FULL-3CCU',   'S3D Full Package 3CCU',             'Full Enterprise 3CCU',            86450, 12968, 'license_plus_annual', 'VGT', 22),
('Synapse 3D', 'S3D-FULL-10CCU',  'S3D Full Package 10CCU',            'Full Enterprise 10CCU',          172500, 25316, 'license_plus_annual', 'VGT', 23),
-- ── S3D Standalone Packages ──
('Synapse 3D', 'S3D-HPB-SA',      'S3D Standalone HPB Surgery',        'HPB Package w/o Base MI',         21012,  1882, 'license_plus_annual', 'VGT', 30),
('Synapse 3D', 'S3D-THOR-SA',     'S3D Standalone Thoracic',           'Thoracic Pack w/o Base MI',       21002,  1882, 'license_plus_annual', 'VGT', 31),
('Synapse 3D', 'S3D-URO-SA',      'S3D Standalone Urology',            'Urology Package w/o Base MI',    16812,  1600, 'license_plus_annual', 'VGT', 32),
('Synapse 3D', 'S3D-BRONCH-SA',   'S3D Standalone Bronchoscopist',     'Bronchoscopist',                   8000,  1123, 'license_plus_annual', 'VGT', 33),
-- ── S3D Upgrade ──
('Synapse 3D', 'S3D-UPG-BASE',    'S3D Upgrade Base V6.1',             'Upgrade Base Package',             5587,  1218, 'license_plus_annual', 'VGT', 40),
('Synapse 3D', 'S3D-UPG-OPT',     'S3D Upgrade Option V6.1',           'Upgrade Option Package',           5131,   866, 'license_plus_annual', 'VGT', 41),
('Synapse 3D', 'S3D-UPG-FULL',    'S3D Upgrade Full V6.1',             'Upgrade Full Package',            36000,  5185, 'license_plus_annual', 'VGT', 42),
-- ── S3D A La Carte Options ──
('Synapse 3D', 'S3D-IVR',         'IVR Simulator',                     NULL,                               4505,   721, 'license_plus_annual', 'VGT', 50),
('Synapse 3D', 'S3D-BONE',        'Bone Viewer Per CCU',               NULL,                               2806,   601, 'license_plus_annual', 'VGT', 51),
('Synapse 3D', 'S3D-MITRAL',      'Mitral Valve Analysis',             NULL,                               3903,   721, 'license_plus_annual', 'VGT', 52),
('Synapse 3D', 'S3D-ONCO',        'Oncology Viewer',                   NULL,                               4505,   721, 'license_plus_annual', 'VGT', 53),
('Synapse 3D', 'S3D-SURFACE',     'Surface Viewer',                    NULL,                               4505,   721, 'license_plus_annual', 'VGT', 54),
('Synapse 3D', 'S3D-PROSTATE',    'Prostate Viewer',                   NULL,                               2806,   601, 'license_plus_annual', 'VGT', 55),
('Synapse 3D', 'S3D-4DFLOW',      '4D Flow',                           NULL,                               4505,   721, 'license_plus_annual', 'VGT', 56),
('Synapse 3D', 'S3D-CARDTX',      'Cardiac Tx Map Per CCU',            NULL,                               4505,   721, 'license_plus_annual', 'VGT', 57),
('Synapse 3D', 'S3D-4DVIEW',      '4D Viewer',                         NULL,                               1703,   601, 'license_plus_annual', 'VGT', 58),
('Synapse 3D', 'S3D-3DCOMP',      '3D Comparison',                     NULL,                               1703,   601, 'license_plus_annual', 'VGT', 59),
('Synapse 3D', 'S3D-DYNAMIC',     'Dynamic Data',                      NULL,                               1703,   601, 'license_plus_annual', 'VGT', 60),
('Synapse 3D', 'S3D-SLICER',      'Slicer',                            NULL,                               1703,   601, 'license_plus_annual', 'VGT', 61),
('Synapse 3D', 'S3D-VESSEL',      'Vessel Extraction',                 NULL,                               1703,   601, 'license_plus_annual', 'VGT', 62),
('Synapse 3D', 'S3D-FUSION',      '3D Fusion',                         NULL,                               1703,   601, 'license_plus_annual', 'VGT', 63),
('Synapse 3D', 'S3D-CORCT',       'Coronary Analysis CT',              NULL,                               4509,   721, 'license_plus_annual', 'VGT', 64),
('Synapse 3D', 'S3D-CARDFCT',     'Cardiac Function CT',               NULL,                               4509,   721, 'license_plus_annual', 'VGT', 65),
('Synapse 3D', 'S3D-CALCIUM',     'Calcium Scoring',                   NULL,                               2806,   601, 'license_plus_annual', 'VGT', 66),
('Synapse 3D', 'S3D-CARDFUS',     'Cardiac Fusion',                    NULL,                               2806,   601, 'license_plus_annual', 'VGT', 67),
('Synapse 3D', 'S3D-CORMR',       'Coronary Analysis MR',              NULL,                               4509,   721, 'license_plus_annual', 'VGT', 68),
('Synapse 3D', 'S3D-CARDFMR',     'Cardiac Function MR',               NULL,                               2806,   601, 'license_plus_annual', 'VGT', 69),
('Synapse 3D', 'S3D-DELAYED',     'Delayed Enhancement',               NULL,                               4509,   721, 'license_plus_annual', 'VGT', 70),
('Synapse 3D', 'S3D-LUNGAIR',     'Lung Analysis/Airway',              NULL,                               5018,  1283, 'license_plus_annual', 'VGT', 71),
('Synapse 3D', 'S3D-LUNGSCOPE',   'Lung Analysis Scope Per CCU',       NULL,                               5018,  1283, 'license_plus_annual', 'VGT', 72),
('Synapse 3D', 'S3D-LUNGRES',     'Lung Analysis Resection',           NULL,                              15653,  1283, 'license_plus_annual', 'VGT', 73),
('Synapse 3D', 'S3D-NUCMED',      'Nuclear Medicine Viewer',           NULL,                               2806,   601, 'license_plus_annual', 'VGT', 74),
('Synapse 3D', 'S3D-DENTAL',      'Dental MPR',                        NULL,                               2806,   601, 'license_plus_annual', 'VGT', 75),
('Synapse 3D', 'S3D-SECTOR',      'Sector MPR',                        NULL,                               2806,   601, 'license_plus_annual', 'VGT', 76),
('Synapse 3D', 'S3D-ADC',         'ADC Viewer',                        NULL,                               2806,   601, 'license_plus_annual', 'VGT', 77),
('Synapse 3D', 'S3D-COMBO',       'Combination',                       NULL,                               2806,   601, 'license_plus_annual', 'VGT', 78),
('Synapse 3D', 'S3D-BRPCT',       'Brain Perfusion CT',                NULL,                               2806,   601, 'license_plus_annual', 'VGT', 79),
('Synapse 3D', 'S3D-BRPMR',       'Brain Perfusion MR',                NULL,                               2806,   601, 'license_plus_annual', 'VGT', 80),
('Synapse 3D', 'S3D-4DPERF',      '4D Perfusion',                      NULL,                               3903,   601, 'license_plus_annual', 'VGT', 81),
('Synapse 3D', 'S3D-3DFAT',       '3D Fat Analysis',                   NULL,                               3903,   601, 'license_plus_annual', 'VGT', 82),
('Synapse 3D', 'S3D-COLON',       'Colon Analysis Per CCU',            NULL,                               4807,   721, 'license_plus_annual', 'VGT', 83),
('Synapse 3D', 'S3D-LIVERCT',     'Liver Analysis CT',                 NULL,                              13240,  1523, 'license_plus_annual', 'VGT', 84),
('Synapse 3D', 'S3D-LIVERMR',     'Liver Analysis MR',                 NULL,                               2806,   601, 'license_plus_annual', 'VGT', 85),
('Synapse 3D', 'S3D-AORTIC',      'Aortic Valve Analysis',             NULL,                               3903,   601, 'license_plus_annual', 'VGT', 86),
('Synapse 3D', 'S3D-STL',         'STL Output (incl Surface)',         NULL,                               5612,   601, 'license_plus_annual', 'VGT', 87),
('Synapse 3D', 'S3D-VR',          'Offline VR',                        NULL,                               2004,   601, 'license_plus_annual', 'VGT', 88),
('Synapse 3D', 'S3D-MRFLOW',      'MR Flow Analysis',                  NULL,                               3903,   601, 'license_plus_annual', 'VGT', 89),
('Synapse 3D', 'S3D-KIDNEY',      'Kidney Analysis',                   NULL,                               9516,  1348, 'license_plus_annual', 'VGT', 90),
('Synapse 3D', 'S3D-4CHAMBER',    '4-Chamber Analysis',                NULL,                               5612,   937, 'license_plus_annual', 'VGT', 91),
('Synapse 3D', 'S3D-ABLATION',    'Cardiac Ablation Analysis',         NULL,                               5612,   937, 'license_plus_annual', 'VGT', 92),
('Synapse 3D', 'S3D-TENSOR',      'Craniotomy/Tensor Analysis',        NULL,                               3815,  1283, 'license_plus_annual', 'VGT', 93),
('Synapse 3D', 'S3D-TXMAP',       'Tx Map',                            NULL,                               4505,   721, 'license_plus_annual', 'VGT', 94),
('Synapse 3D', 'S3D-IVIM',        'IVIM',                              NULL,                               1874,   601, 'license_plus_annual', 'VGT', 95),
('Synapse 3D', 'S3D-BREAST',      'Breast Analysis',                   NULL,                               1874,   601, 'license_plus_annual', 'VGT', 96),
('Synapse 3D', 'S3D-ENDO',        'Endoscopic Simulator',              NULL,                               6685,   601, 'license_plus_annual', 'VGT', 97),
('Synapse 3D', 'S3D-KIDVOL',      'Kidney Volumetry',                  NULL,                               2430,   601, 'license_plus_annual', 'VGT', 98),
('Synapse 3D', 'S3D-CPCT',        'Cardiac Perfusion CT',              'A la carte only',                  4505,   451, 'license_plus_annual', 'VGT', 99),
('Synapse 3D', 'S3D-CPMR',        'Cardiac Perfusion MR',              'A la carte only',                  4505,   451, 'license_plus_annual', 'VGT', 100),
('Synapse 3D', 'S3D-ABDOPERF',    'Abdominal Perfusion',               'A la carte only',                  4505,   451, 'license_plus_annual', 'VGT', 101),
('Synapse 3D', 'S3D-MOBILE',      'Mobile License',                    NULL,                               1003,   601, 'license_plus_annual', 'VGT', 102),
('Synapse 3D', 'S3D-DUALENERGY',  'Dual Energy',                       'A la carte only',                  4571,   601, 'license_plus_annual', 'VGT', 103),
('Synapse 3D', 'S3D-PANCREAS',    'Pancreas Analysis',                 'A la carte only',                 13600,   600, 'license_plus_annual', 'VGT', 104),
('Synapse 3D', 'S3D-RECTAL',      'Rectal Analysis',                   'A la carte only',                 15200,  1000, 'license_plus_annual', 'VGT', 105),
('Synapse 3D', 'S3D-KNEE',        'Knee Joint Analysis',               'A la carte only',                 11925,  1000, 'license_plus_annual', 'VGT', 106),
('Synapse 3D', 'S3D-PIXELSHINE',  'PixelShine 1CCU',                   'A la carte only',                  3000,  1440, 'license_plus_annual', 'VGT', 107),
('Synapse 3D', 'S3D-QSM',         'QSM Analysis 1CCU',                 'A la carte only',                  3000,  1440, 'license_plus_annual', 'VGT', 108),
('Synapse 3D', 'S3D-BRAINSUB',    'Brain Subregion',                   NULL,                               6857,  1440, 'license_plus_annual', 'VGT', 109),
-- ── AI REiLI ──
('AI REiLI',   'REILI-CHEST',     'REiLI Chest X-ray AI',              'AI detection chest X-ray',            0,  4500, 'subscription', 'VGT', 200),
('AI REiLI',   'REILI-MAMMO',     'REiLI Mammography AI',              'AI detection mammography',            0,  6000, 'subscription', 'VGT', 201),
('AI REiLI',   'REILI-CT-LUNG',   'REiLI CT Lung AI',                  'AI lung nodule detection',            0,  5500, 'subscription', 'VGT', 202),
('AI REiLI',   'REILI-BONE',      'REiLI Bone Fracture AI',            'AI bone fracture detection',          0,  4500, 'subscription', 'VGT', 203),
-- ── Avicenna ──
('Avicenna',   'AVI-ANALYTICS',   'Avicenna Analytics',                'AI radiology analytics',              0,  8000, 'subscription', 'VGT', 210),
-- ── SYN Pathology ──
('SYN Pathology','SYNPATH-BASE',  'Synapse Pathology Base',            'Digital pathology platform',      25000,  5000, 'license_plus_annual', 'VGT', 220),
('SYN Pathology','SYNPATH-AI',    'Synapse Pathology AI',              'AI-assisted pathology',               0,  8000, 'subscription', 'VGT', 221),
-- ── Contextflow ──
('Contextflow','CF-SEARCH',       'Contextflow SEARCH Lung CT',        'AI search engine radiology',          0,  6000, 'subscription', 'VGT', 230),
-- ── Gleamer ──
('Gleamer',    'GLEAM-BONEVIEW',  'Gleamer BoneView',                  'AI bone fracture X-ray',              0,  5000, 'subscription', 'VGT', 240),
('Gleamer',    'GLEAM-CHESTVIEW', 'Gleamer ChestView',                 'AI chest X-ray screening',            0,  5000, 'subscription', 'VGT', 241),
-- ── Lunit ──
('Lunit',      'LUNIT-CXR',      'Lunit INSIGHT CXR',                 'AI chest X-ray',                      0,  5500, 'subscription', 'VGT', 250),
('Lunit',      'LUNIT-MMG',      'Lunit INSIGHT MMG',                 'AI mammography',                      0,  7000, 'subscription', 'VGT', 251),
-- ── IBEX ──
('IBEX',       'IBEX-PROSTATE',   'IBEX Galen Prostate',              'AI pathology prostate',               0,  9000, 'subscription', 'VGT', 260),
('IBEX',       'IBEX-BREAST',     'IBEX Galen Breast',                'AI pathology breast',                 0,  9000, 'subscription', 'VGT', 261),
-- ── AI Gateway ──
('AI Gateway', 'AIGW-BASE',       'AI Gateway Platform',               'AI orchestration platform',       15000,  3000, 'license_plus_annual', 'VGT', 270),
-- ── DP Extential ──
('DP Extential','DPE-SCANNER',    'DP Extential Scanner Integration',  'Digital pathology scanner',            0,  4000, 'subscription', 'VGT', 280),
-- ── PACS / VNA ──
('PACS',       'SYN-PACS',        'Synapse PACS',                      'Enterprise PACS',                 50000, 10000, 'license_plus_annual', 'VGT', 300),
('PACS',       'SYN-VNA',         'Synapse VNA',                       'Vendor Neutral Archive',          30000,  6000, 'license_plus_annual', 'VGT', 301),
('PACS',       'SYN-MOBILITY',    'Synapse Mobility',                  'Mobile access to PACS',           10000,  2000, 'license_plus_annual', 'VGT', 302),
-- ── CWM ──
('CWM',        'CWM-RISBI',       'CWM RIS/BI',                       'Radiology Info System + BI',      40000,  8000, 'license_plus_annual', 'VGT', 400),
('CWM',        'CWM-TELE',        'CWM Teleradiology',                'Teleradiology module',            15000,  3000, 'license_plus_annual', 'VGT', 401),
('CWM',        'CWM-IVD',         'CWM IVD Connectivity',             'IVD PayPerSlide',                     0,     0, 'pay_per_study',       'VGT', 402),
('CWM',        'CWM-ES-SILVER',   'CWM ES Silver',                    'Enterprise Silver',               20000,  4000, 'license_plus_annual', 'VGT', 403),
('CWM',        'CWM-ES-DIAMOND',  'CWM ES Diamond',                   'Enterprise Diamond',              35000,  7000, 'license_plus_annual', 'VGT', 404),
('CWM',        'CWM-DOSE',        'CWM Dose',                         'Dose management',                 12000,  2400, 'license_plus_annual', 'VGT', 405),
-- ── MedSky ──
('MedSky',     'MEDSKY-PORTAL',   'MedPortal',                        'Patient portal',                  10000,  2000, 'license_plus_annual', 'VGT', 410),
('MedSky',     'MEDSKY-SETUP',    'MedSky Setup',                     'Implementation & setup',           5000,     0, 'license_plus_annual', 'VGT', 411),
('MedSky',     'MEDSKY-SUPPORT',  'MedSky Support',                   'Annual support',                      0,  3000, 'subscription',        'VGT', 412),
-- ── VMWare ──
('VMWare',     'VMW-STD',         'VMWare Standard License',           'Virtualization standard',          5000,  1200, 'license_plus_annual', 'VGT', 500),
('VMWare',     'VMW-ENT',         'VMWare Enterprise License',         'Virtualization enterprise',       12000,  2400, 'license_plus_annual', 'VGT', 501)
on conflict do nothing;
