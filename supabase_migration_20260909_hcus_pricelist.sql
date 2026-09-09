-- HCUS price list "MI Product Price List SUB 2026 V7.5" (effective 2026-01-01, EUR).
--
-- Every figure below is the PRICE TO FEN — what we pay HCUS — i.e. our cost.
-- There is no published sell price in this list: the sell price is cost plus
-- the margin the rep sets on the deal, which is why only transfer_price and
-- annual_support are stored here. The list quotes FEN standard gross margins
-- of 15 / 20 / 25 / 30 %, held in app_settings, not here.
--
-- The catalogue stays small: `products` holds the ~13 families a rep picks
-- from, and `product_items` holds the 225 priced SKUs underneath them. That
-- is what keeps the 84 Synapse 3D lines out of the top-level product list.

create table if not exists public.product_items (
  id             uuid primary key default gen_random_uuid(),
  family_code    text not null,
  product_id     uuid references public.products(id) on delete set null,
  supplier_code  text not null default 'HCUS',
  supplier_sku   text,
  name           text not null,
  description    text,
  section        text,
  kind           text not null default 'module'
                 check (kind in ('package','module','upgrade','hardware','service')),
  unit           text not null default 'unit'
                 check (unit in ('unit','study','case','user','ccu','block_10k')),
  ccu            integer,
  tier_from      integer,
  tier_to        integer,
  transfer_price numeric(14,2),
  annual_support numeric(14,2),
  support_sku    text,
  support_name   text,
  remark         text,
  price_list     text not null default 'HCUS MI SUB 2026 V7.5',
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists product_items_family_idx  on public.product_items(family_code);
create index if not exists product_items_product_idx on public.product_items(product_id);
create unique index if not exists product_items_sku_idx
  on public.product_items(price_list, family_code, name);

-- This table IS a cost list: every money column on it is what we pay HCUS. RLS
-- filters rows, not columns, so the table itself is closed to everyone below
-- manager and the money never leaves it.
alter table public.product_items enable row level security;

drop policy if exists "product_items read" on public.product_items;
create policy "product_items read" on public.product_items for select using (
  exists (select 1 from public.profiles
          where id = auth.uid() and active = true and role in ('admin','manager'))
);

drop policy if exists "product_items write" on public.product_items;
create policy "product_items write" on public.product_items for all using (
  exists (select 1 from public.profiles
          where id = auth.uid() and active = true and role in ('admin','manager'))
) with check (
  exists (select 1 from public.profiles
          where id = auth.uid() and active = true and role in ('admin','manager'))
);

revoke all on public.product_items from anon;

-- Reps still have to pick licence modules by name, so the descriptive columns
-- come through this view. It is deliberately NOT security_invoker: it runs as
-- owner and bypasses the policy above, which is safe precisely because it
-- selects no money column — adding one here would hand our cost to every
-- salesperson and to any distributor account.
drop view if exists public.product_items_v;
create view public.product_items_v as
  select id, family_code, product_id, supplier_code, supplier_sku, name,
         description, section, kind, unit, ccu, tier_from, tier_to,
         price_list, active, sort_order
  from public.product_items;

revoke all on public.product_items_v from anon;
grant select on public.product_items_v to authenticated;

-- Reload the whole price list idempotently: this file IS the price list, so a
-- new HCUS version is applied by editing it and running it again.
delete from public.product_items where price_list = 'HCUS MI SUB 2026 V7.5';

insert into public.product_items
  (family_code, supplier_code, supplier_sku, name, description, section, kind, unit,
   ccu, tier_from, tier_to, transfer_price, annual_support, support_sku, support_name,
   remark, sort_order) values
  ('SYNAPSE-PACS', 'HCUS', '800017030', 'PACS BASE LIC FOR EACH 10K STUDIES', 'Base volume license for each 10k studies', 'Synapse PACS Licenses', 'module', 'block_10k', null, null, null, 6320.4, 477.25, '800017041', 'NSS INT VOL 10K YS', null, 14),
  ('SYNAPSE-PACS', 'HCUS', '800017032', 'PACS RIS-PACS INTERFACE LIC PER SERVER', 'RIS-PACS Interface Standard seat license', 'RIS Server', 'module', 'unit', null, null, null, 5417.65, 409.4, '800017043', 'NSS INT HIIS YS', null, 17),
  ('SYNAPSE-PACS', 'HCUS', '800050230', 'PACS LVS 20K BUNDLE', 'Low Volume Synapse Licence', 'Special Packages- Non discountable', 'package', 'unit', null, null, null, 8519.2, 1704.3, '800045639', 'LVS SYN 20K BUNDLE YS', null, 20),
  ('SYNAPSE-PACS', 'HCUS', '800017038', 'PACS ACTIVE MONITORING FEE', 'Active Monitoring Fee', 'PACS-Option Software', 'module', 'unit', null, null, null, 299, 299, '800000001', 'ACTMON KIT YS', null, 23),
  ('SYNAPSE-PACS', 'HCUS', '800018656', 'PACS RECOLLECTION SAS LICENSE FOR DICOMSERVER', 'Recollection SAS License For Dicomserver', 'PACS-Option Software', 'module', 'unit', null, null, null, 852.15, 86.25, '800042246', 'SAS-INT-MNT-YS-FEE', null, 24),
  ('SYNAPSE-PACS', 'HCUS', '800050217', 'COMPUTE STD 10K LIC FTYO', 'COMPUTE STD 10K LIC FTYO', 'Oracle License', 'module', 'unit', null, null, null, 1150, 184, '870001478', 'COMPUTE STD 10K ANN SUPP LIC FTYO', null, 27),
  ('SYNAPSE-PACS', 'HCUS', '800050218', 'COMPUTE ENT 10K LIC FTYO', 'COMPUTE ENT 10K LIC FTYO', 'Oracle License', 'module', 'unit', null, null, null, 2300, 368, '870001479', 'COMPUTE ENT 10K ANN SUPP LIC FTYO', null, 28),
  ('SYNAPSE-PACS', 'HCUS', '800050219', 'COMPUTE STD 10K LIC CNV FTYO (CONVERSION)', 'COMPUTE STD 10K LIC CNV FTYO (CONVERSION)', 'Oracle License', 'module', 'unit', null, null, null, 724.5, 184, '870001478', 'COMPUTE STD 10K ANN SUPP LIC FTYO', null, 29),
  ('SYNAPSE-PACS', 'HCUS', '800050220', 'COMPUTE ENT 10K LIC CNV FTYO (CONVERSION)', 'COMPUTE ENT 10K LIC CNV FTYO (CONVERSION)', 'Oracle License', 'module', 'unit', null, null, null, 1449, 368, '870001479', 'COMPUTE ENT 10K ANN SUPP LIC FTYO', null, 30),
  ('SYNAPSE-PACS', 'HCUS', '800047997', 'VNA DICOM LIC 10K STUDIES', 'Software DICOM components for 10k studies', 'VNA License', 'module', 'block_10k', null, null, null, 4168.75, 417.45, '870001067', 'VNA ANN SUPP DICOM 10K', null, 33),
  ('SYNAPSE-PACS', 'HCUS', '800047996', 'VNA NON-DICOM LIC PER DEPARTMENT', 'Synapse VNA - Software Non-DICOM components per Department', 'VNA License', 'module', 'unit', null, null, null, 2518.5, 417.45, '870001068', 'VNA NON-DICOM SITE LIC ASF', null, 34),
  ('SYNAPSE-PACS', 'HCUS', '800047995', 'VNA DICOM LIC FOR 10K PACS', 'Software DICOM components for 10k studies only for bundle deal with Synapse PACS', 'VNA License - only for bundle purchase with PACS License', 'package', 'block_10k', null, null, null, 2084.95, 208.15, '870001052', 'VNA ANN SUPP DICOM 10K PACS', null, 37),
  ('SYNAPSE-PACS', 'HCUS', '800047992', 'VNA NON-DICOM LIC FOR 10K PACS', 'Software Non-DICOM components per Department only for bundle deal with Synapse PACS', 'VNA License - only for bundle purchase with PACS License', 'package', 'unit', null, null, null, 417.45, 41.4, '870001053', 'VNA ANN SUPP NON-DICOM 10K PACS', null, 38),
  ('SYNAPSE-PACS', 'HCUS', '800051806', 'PACS MAMMO WORKFLOW KEYPAD', 'Mammography Workflow Keypad', 'PACS-Option Hardware', 'hardware', 'unit', null, null, null, 1610, null, null, null, null, 41),
  ('SYNAPSE-PACS', 'HCUS', '800021672', 'PACS SYNAPSE SOFTWARE CD', 'Physical CD for shipping requirements', 'PACS-Option Hardware', 'hardware', 'unit', null, null, null, 7.84, null, null, null, null, 42),
  ('SYNAPSE-PACS', 'HCUS', '870001054', 'INT SYN PACS BASE LICENSE FOR 10K OPEX', 'PACS BASE LICENSE FOR 10K OPEX', 'OPEX Model per Year', 'module', 'unit', null, null, null, 2125.2, null, null, null, null, 45),
  ('SYNAPSE-PACS', 'HCUS', '870001055', 'INT SYN PACS-RIS INTERFACE PER SITE OPEX', 'PACS PACS-RIS INTERFACE PER SITE OPEX', 'OPEX Model per Year', 'module', 'unit', null, null, null, 1821.6, null, null, null, null, 46),
  ('SYNAPSE-PACS', 'HCUS', '870001056', 'INT SYN PACS ACTIVE MONITORING OPEX', 'PACS ACTIVE MONITORING OPEX', 'OPEX Model per Year', 'module', 'unit', null, null, null, 414, null, null, null, null, 47),
  ('SYNAPSE-PACS', 'HCUS', '800050229', 'INT SYN COMPUTE STD 10K LIC OPEX FTYO', 'SYN COMPUTE STD 10K LIC OPEX FTYO', 'OPEX Model per Year', 'module', 'unit', null, null, null, 510.6, null, null, null, null, 49),
  ('SYNAPSE-PACS', 'HCUS', '800050228', 'INT SYN COMPUTE ENT 10K LIC OPEX FTYO', 'SYN COMPUTE ENT 10K LIC OPEX FTYO', 'OPEX Model per Year', 'module', 'unit', null, null, null, 1035, null, null, null, null, 50),
  ('SYNAPSE-PACS', 'HCUS', '800050227', 'INT SYN COMPUTE STD 10K LIC CNV OPEX FTYO', 'SYN COMPUTE STD 10K LIC CNV OPEX FTYO', 'OPEX Model per Year', 'module', 'unit', null, null, null, 358.8, null, null, null, null, 51),
  ('SYNAPSE-PACS', 'HCUS', '800050226', 'INT SYN COMPUTE ENT 10K LIC CNV OPEX FTYO', 'SYN COMPUTE ENT 10K LIC CNV OPEX FTYO', 'OPEX Model per Year', 'module', 'unit', null, null, null, 703.8, null, null, null, null, 52),
  ('SYNAPSE-PACS', 'HCUS', '870001062', 'INT SYN VNA DICOM LIC 10K OPEX', 'VNA DICOM LIC 10K OPEX', 'OPEX Model per Year', 'module', 'unit', null, null, null, 1490.4, null, null, null, null, 54),
  ('SYNAPSE-PACS', 'HCUS', '870001060', 'INT SYN VNA NON-DICOM LIC 10K OPEX', 'VNA NON-DICOM LIC 10K OPEX', 'OPEX Model per Year', 'module', 'unit', null, null, null, 303.6, null, null, null, null, 55),
  ('SYNAPSE-PACS', 'HCUS', '870001063', 'INT SYN VNA DICOM 10K WITH PACS OPEX', 'VNA DICOM 10K WITH PACS OPEX', 'OPEX Model per Year', 'module', 'unit', null, null, null, 745.2, null, null, null, null, 56),
  ('SYNAPSE-PACS', 'HCUS', '870001061', 'INT SYN VNA NON-DICOM 10K WITH PACS OPEX', 'VNA NON-DICOM 10K WITH PACS OPEX', 'OPEX Model per Year', 'module', 'unit', null, null, null, 151.8, null, null, null, null, 57),
  ('SYNAPSE-3D', 'HCUS', '16818813', '3D LIC DONGLE KIT FOR DEMO', '3D dongle for Demo (Version free)', '3D Dongle Kit', 'hardware', 'unit', null, null, null, 205, null, null, null, null, 14),
  ('SYNAPSE-3D', 'HCUS', '16774885', 'SYNAPSE 3D KEY INT E', '3D Version-less dongle for production', '3D Dongle Kit', 'hardware', 'unit', null, null, null, 180, null, null, null, null, 15),
  ('SYNAPSE-3D', 'HCUS', '16827955', '3D LIC CD V6.8 FOR UPGRADE & ONLINE ACTIVATION', '3D V6.8 CD', '3D Dongle Kit', 'upgrade', 'unit', null, null, null, 80, null, null, null, null, 16),
  ('SYNAPSE-3D', 'HCUS', '16700195', '3D - INT SYN 3D BASE PKG STANDALONE 1 CCU V6', 'Base package(Standalone)', 'Package', 'package', 'ccu', 1, null, null, 5520, 885.5, '16707818', 'INT SYN 3D ANN SUPP BASE STANDALONE V6', 'For 1 CCU only. (cannot be increased later)', 18),
  ('SYNAPSE-3D', 'HCUS', '16710205', '3D - INT SYN 3D BASE PKG SERVER 3 CCU V6', 'Base package(Server) 3CCU', 'Package', 'package', 'ccu', 3, null, null, 8970, 1437.5, '16710243', 'INT SYN 3D ANN SUPP BASE SERVER 3CCU V6', '3CCU', 19),
  ('SYNAPSE-3D', 'HCUS', '16700200', '3D - INT SYN 3D BASE PKG SERVER 10 CCU V6', 'Base package(Server) 10CCU', 'Package', 'package', 'ccu', 10, null, null, 13800, 2208, '16707820', 'INT SYN 3D ANN SUPP BASE SERVER 10CCU V6', '8->10CCU', 20),
  ('SYNAPSE-3D', 'HCUS', '16710217', '3D - INT SYN 3D RADIOLOGY PKG 3 CCU V6', 'Radiology package 3CCU', 'Package', 'package', 'ccu', 3, null, null, 8970, 1437.5, '16710255', 'INT SYN 3D ANN SUPP RADIO PKG 3CCU V6', '3 CCUs, 7 app added.', 21),
  ('SYNAPSE-3D', 'HCUS', '16700212', '3D - INT SYN 3D RADIOLOGY PKG 10 CCU V6', 'Radiology package 10CCU', 'Package', 'package', 'ccu', 10, null, null, 15249, 2439, '16707832', 'INT SYN 3D ANN SUPP RAD PKG 10CCU V6', '10 CCUs, 7 app added.', 22),
  ('SYNAPSE-3D', 'HCUS', '16700224', '3D - INT SYN 3D RADIOLOGY ENTERPR PKG 3CCU V6', 'Radiology Enterprise package 3CCU', 'Package', 'package', 'ccu', 3, null, null, 32200, 5152, '16707844', 'INT SYN 3D ANN SUPP RADIO ENT PKG 3CCU V6', '3 CCUs, 7 app added.', 23),
  ('SYNAPSE-3D', 'HCUS', '16700236', '3D - INT SYN 3D RADIOLOGY ENTERPR PKG 10CCU V6', 'Radiology Enterprise package 10CCU', 'Package', 'package', 'ccu', 10, null, null, 50600, 8096, '16707856', 'INT SYN 3D ANN SUPP RAD ENT PKG 10CCU V6', null, 24),
  ('SYNAPSE-3D', 'HCUS', '16700250', '3D - INT SYN 3D CARDIO CT PKG 1 CCU V6', 'Cardiology CT package', 'Package', 'package', 'ccu', 1, null, null, 10580, 1690.5, '16707870', 'INT SYN 3D ANN SUPP CARDIOLOGY CT PKG V6', '"Aortic Valve Analysis" is added.', 25),
  ('SYNAPSE-3D', 'HCUS', '16700262', '3D - INT SYN 3D CARDIO MR PKG 1 CCU V6', 'Cardiology MR package', 'Package', 'package', 'ccu', 1, null, null, 9660, 1541, '16707882', 'INT SYN 3D ANN SUPP CARDIOLOGY MR PKG V6', null, 26),
  ('SYNAPSE-3D', 'HCUS', '16700274', '3D - INT SYN 3D HPB SURGERY PKG 1 CCU V6', 'HPB surgery package', 'Package', 'package', 'ccu', 1, null, null, 10120, 1621.5, '16707894', 'INT SYN 3D ANN SUPP HPB SURGERY PKG V6', '"Liver Analysis MR" is added.', 27),
  ('SYNAPSE-3D', 'HCUS', '16700286', '3D - INT SYN 3D THORACIC SURGERY PKG 1CCU V6', 'Thoracic surgery package', 'Package', 'package', 'ccu', 1, null, null, 11500, 1840, '16707909', 'INT SYN 3D ANN SUPP THORACIC SURG PKG V6', null, 28),
  ('SYNAPSE-3D', 'HCUS', '16700298', '3D - INT SYN 3D UROLOGY PKG 1 CCU V6', 'Urology package', 'Package', 'package', 'ccu', 1, null, null, 10120, 1621.5, '16707911', 'INT SYN 3D ANN SUPP UROLOGY PKG V6', null, 29),
  ('SYNAPSE-3D', 'HCUS', '16700303', '3D - INT SYN 3D FULL PACKAGE 3 CCU V6', 'Full package -3CCU', 'Package', 'package', 'ccu', 3, null, null, 69000, 11040, '16707923', 'INT SYN 3D ANN SUPP FULL PKG 3 CCU V6', null, 30),
  ('SYNAPSE-3D', 'HCUS', '16700315', '3D - INT SYN 3D FULL PACKAGE 10 CCU V6', 'Full package -10CCU', 'Package', 'package', 'ccu', 10, null, null, 138000, 22080, '16707935', 'INT SYN 3D ANN SUPP FULL PKG 10 CCU V6', '8->10 CCU, 5 apps added', 31),
  ('SYNAPSE-3D', 'HCUS', '16700339', '3D - INT SYN 3D STANDALONE HPB SURGERY PKG V6', 'HPB surgery package', 'Special Standalone Package For EU *NOTE* not need to purchase Base package', 'package', 'unit', null, null, null, 9660, 966, '16707959', 'INT SYN 3D ANN SUPP STANDALONE HPB V6', null, 33),
  ('SYNAPSE-3D', 'HCUS', '16700341', '3D - INT SYN 3D STANDALONE THORACIC PKG V6', 'Thoracic surgery package', 'Special Standalone Package For EU *NOTE* not need to purchase Base package', 'package', 'unit', null, null, null, 8280, 920, '16707961', 'INT SYN 3D ANN SUPP STANDALONE THORAC V6', null, 34),
  ('SYNAPSE-3D', 'HCUS', '16700353', '3D - INT SYN 3D STANDALONE UROLOGY PKG V6', 'Urology package', 'Special Standalone Package For EU *NOTE* not need to purchase Base package', 'package', 'unit', null, null, null, 8280, 828, '16707973', 'INT SYN 3D ANN SUPP STANDALONE UROLOG V6', null, 35),
  ('SYNAPSE-3D', 'HCUS', '16700365', '3D - INT SYN 3D STANDALONE BRONCHO PKG V6', 'Bronchoscopist', 'Special Standalone Package For EU *NOTE* not need to purchase Base package', 'package', 'unit', null, null, null, 6900, 1104, '16707985', 'INT SYN 3D ANN SUPP STANDALONE BRONCH V6', null, 36),
  ('SYNAPSE-3D', 'HCUS', '16708159', '3D - INT SYN 3D UPGRADE BASE PACKAGE V6', 'Upgrade-Base Package', 'Upgrade', 'upgrade', 'unit', null, null, null, 6440, 1035, '16708202', 'INT SYN 3D ANN SUPP UPG BASE PKG V6', null, 38),
  ('SYNAPSE-3D', 'HCUS', '16708173', '3D - INT SYN 3D UPGRADE OPTION PACKAGE V6', 'Upgrade-Option Package', 'Upgrade', 'upgrade', 'unit', null, null, null, 4600, 736, '16708226', 'INT SYN 3D ANN SUPP UPG OPTION PKG V6', null, 39),
  ('SYNAPSE-3D', 'HCUS', '16708185', '3D - INT SYN 3D UPGRADE FULL PACKAGE V6', 'Upgrade-Full Package', 'Upgrade', 'upgrade', 'unit', null, null, null, 27600, 4416, '16708238', 'INT SYN 3D ANN SUPP UPG FULL PKG V6', null, 40),
  ('SYNAPSE-3D', 'HCUS', '16710190', '3D - INT SYN 3D IVR SIMULATOR', 'IVR Simulator', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 3829.5, 612.95, '870001420', '3D - INT SYN 3D ANN SUPP IVR SIMULATOR', null, 42),
  ('SYNAPSE-3D', 'HCUS', '16644016', '3D - INT SYN 3D BONE VIEWER PER CCU', 'Rib Viewer (Bone Viewer)', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 2385.1, 510.6, '870001114', '3D - INT SYN ANN SUPP 3D BONE VIEWER PER CCU', null, 43),
  ('SYNAPSE-3D', 'HCUS', '16644004', '3D - INT SYN 3D MIT VALVE ANALYSIS CCU', 'Mitral valve Analysis', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 3322.35, 510.6, '870001113', '3D - INT SYN ANN SUPP 3D MIT VALVE ANALYSIS CCU', null, 44),
  ('SYNAPSE-3D', 'HCUS', '16593750', '3D - INT SYN 3D ONCOLOGY VIEWER PER CCU', 'Oncology viewer', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 3829.5, 612.95, '870000919', '3D - INT SYN 3D ANN SUPP ONCOLOGY VIEWER', null, 45),
  ('SYNAPSE-3D', 'HCUS', '16593762', '3D - INT SYN 3D SURFACE VIEWER - Per CCU/Stand Alone', 'Surface viewer', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 3829.5, 612.95, '870000920', '3D - INT SYN 3D ANN SUPP SURFACE VIEWER', null, 46),
  ('SYNAPSE-3D', 'HCUS', '16593774', '3D - INT SYN 3D PROSTATE VIEWER PER CCU', 'Prostate viewer', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 2385.1, 612.95, '870000918', '3D - INT SYN 3D ANN SUPP PROSTATE VIEWER', null, 47),
  ('SYNAPSE-3D', 'HCUS', '16626595', '3D - INT SYN 3D 4D FLOW PER CCU', '4D Flow', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 3829.5, 612.95, '870001081', '3D - INT SYN ANN SUPP 3D 4D FLOW PER CCU', null, 48),
  ('SYNAPSE-3D', 'HCUS', '16626600', '3D - INT SYN 3D CARDIAC TX MAP PER CCU', 'Cardiac TX Map', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 3829.5, 612.95, '870001082', '3D - INT SYN ANN SUPP 3D Cardiac Tx Map PER CCU', null, 49),
  ('SYNAPSE-3D', 'HCUS', '16472102', '3D - INT 4D Viewer', '4D Viewer', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 1447.85, 510.6, '800045445', '3D - INT Annual Supp 4D Viewer', null, 50),
  ('SYNAPSE-3D', 'HCUS', '16472114', '3D - INT 3D Comparison', '3D Comparison', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 1447.85, 510.6, '800045444', '3D - INT Annual Supp 3D Comparison', null, 51),
  ('SYNAPSE-3D', 'HCUS', '16472126', '3D - INT Dynamic Data', 'Dynamic Data', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 1447.85, 510.6, '800045443', '3D - INT Annual Supp Dynamic Data', null, 52),
  ('SYNAPSE-3D', 'HCUS', '16472138', '3D - INT Slicer', 'Slicer', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 1447.85, 510.6, '800045442', '3D - INT Annual Supp Slicer', null, 53),
  ('SYNAPSE-3D', 'HCUS', '16472140', '3D - INT Vessel Extraction', 'Vessel Extraction', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 1447.85, 510.6, '800045441', '3D - INT Annual Supp Vessel Extraction', null, 54),
  ('SYNAPSE-3D', 'HCUS', '16472164', '3D - INT 2D Fusion', '2D Fusion', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 1447.85, 510.6, '800045440', '3D - INT Annual Supp 2D Fusion', null, 55),
  ('SYNAPSE-3D', 'HCUS', '16472176', '3D - INT Coronary Analysis CT', 'Coronary Analysis CT', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 3832.95, 612.95, '800045439', '3D - INT Annual Supp Coronary Analysis CT', null, 56),
  ('SYNAPSE-3D', 'HCUS', '16472188', '3D - INT Cardiac Function CT', 'Cardiac Function CT', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 3832.95, 510.6, '800045438', '3D - INT Annual Supp Cardiac Function CT', null, 57),
  ('SYNAPSE-3D', 'HCUS', '16472190', '3D - INT Calcium Scoring', 'Calcium Scoring', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 2385.1, 510.6, '800045437', '3D - INT Annual Supp Calcium Scoring', null, 58),
  ('SYNAPSE-3D', 'HCUS', '16472205', '3D - INT Cardiac Fusion', 'Cardiac Fusion', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 2385.1, 510.6, '800045436', '3D - INT Annual Supp Cardiac Fusion', null, 59),
  ('SYNAPSE-3D', 'HCUS', '16472217', '3D - INT Coronary Analysis MR', 'Coronary Analysis MR', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 3832.95, 612.95, '800045435', '3D - INT Annual Supp Coronary Analysis MR', null, 60),
  ('SYNAPSE-3D', 'HCUS', '16472229', '3D - INT Cardiac Function MR', 'Cardiac Function MR', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 2385.1, 510.6, '800045434', '3D - INT Annual Supp Cardiac Function MR', null, 61),
  ('SYNAPSE-3D', 'HCUS', '16472231', '3D - INT Delayed Enhancement', 'Delayed Enhancement', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 3832.95, 612.95, '800045433', '3D - INT Annual Supp Delayed Enhancement', null, 62),
  ('SYNAPSE-3D', 'HCUS', '16472243', '3D - INT Lung Analysis/Airway', 'Lung Analysis/Airway', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 6814.9, 1090.2, '800045432', '3D - INT Annual Supp Lung Analysis/Airway', null, 63),
  ('SYNAPSE-3D', 'HCUS', '16472267', '3D - INT Lung Analysis Scope * Per CCU', 'Lung Analysis Scope * Per CCU', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 6814.9, 1090.2, '800045431', '3D - INT Annual Supp Lung Analysis Scope * Per CCU', null, 64),
  ('SYNAPSE-3D', 'HCUS', '16472281', '3D - INT Lung Analysis Resection', 'Lung Analysis Resection', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 7360, 1090.2, '800045430', '3D - INT Annual Supp Lung Analysis Resection', null, 65),
  ('SYNAPSE-3D', 'HCUS', '16472293', '3D - INT Nuclear Medicine Viewer', 'Nuclear Medicine Viewer', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 2385.1, 510.6, '800045429', '3D - INT Annual Supp Nuclear Medicine Viewer', null, 66),
  ('SYNAPSE-3D', 'HCUS', '16472308', '3D - INT Dental MPR', 'Dental MPR', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 2385.1, 510.6, '800045428', '3D - INT Annual Supp Dental MPR', null, 67),
  ('SYNAPSE-3D', 'HCUS', '16472310', '3D - INT Sector MPR', 'Sector MPR', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 2385.1, 510.6, '800045427', '3D - INT Annual Supp Sector MPR', null, 68),
  ('SYNAPSE-3D', 'HCUS', '16472322', '3D - INT ADC Viewer', 'ADC Viewer', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 2385.1, 510.6, '800045425', '3D - INT Annual Supp ADC Viewer', null, 69),
  ('SYNAPSE-3D', 'HCUS', '16472334', '3D - INT Combination', 'Combination', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 2385.1, 510.6, '800045424', '3D - INT Annual Supp Combination', null, 70),
  ('SYNAPSE-3D', 'HCUS', '16472346', '3D - INT Brain Perfusion CT', 'Brain Perfusion CT', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 2385.1, 510.6, '800045423', '3D - INT Annual Supp Brain Perfusion CT', null, 71),
  ('SYNAPSE-3D', 'HCUS', '16472358', '3D - INT Brain Perfusion MR', 'Brain Perfusion MR', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 2385.1, 510.6, '800045422', '3D - INT Annual Supp Brain Perfusion MR', null, 72),
  ('SYNAPSE-3D', 'HCUS', '16472360', '3D - INT 4D Perfusion', '4D Perfusion', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 3322.35, 510.6, '800045421', '3D - INT Annual Supp 4D Perfusion', null, 73),
  ('SYNAPSE-3D', 'HCUS', '16472372', '3D - INT 3D Fat Analysis', '3D Fat Analysis', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 3322.35, 510.6, '800045408', '3D - INT Annual Supp 3D Fat Analysis', null, 74),
  ('SYNAPSE-3D', 'HCUS', '16472384', '3D - INT Colon Analysis * Per CCU', 'Colon Analysis * Per CCU', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 3680, 612.95, '800045420', '3D - INT Annual Supp Colon Analysis * Per CCU', null, 75),
  ('SYNAPSE-3D', 'HCUS', '16472396', '3D - INT Liver Analysis CT', 'Liver Analysis CT', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 8092.55, 1294.9, '800045419', '3D - INT Annual Supp Liver Analysis CT', null, 76),
  ('SYNAPSE-3D', 'HCUS', '16472401', '3D - INT Liver Analysis MR', 'Liver Analysis MR', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 2385.1, 510.6, '800045418', '3D - INT Annual Supp Liver Analysis MR', null, 77),
  ('SYNAPSE-3D', 'HCUS', '16472413', '3D - INT Aortic Valve Analysis', 'Aortic Valve Analysis', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 3322.35, 510.6, '800045417', '3D - INT Annual Supp Aortic Valve Analysis', null, 78),
  ('SYNAPSE-3D', 'HCUS', '16472425', '3D - INT STL Output (includes Surface)', 'STL Output (includes Surface) - Per CCU/Stand Alone', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 4770.2, 762.45, '800045396', '3D - INT Annual Supp STL Output (Incl. Surface)', null, 79),
  ('SYNAPSE-3D', 'HCUS', '16472437', '3D - INT Offline VR', 'Offline VR', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 1703.15, 510.6, '800045416', '3D - INT Annual Supp Offline VR', null, 80),
  ('SYNAPSE-3D', 'HCUS', '16472463', '3D - INT MR Flow Analysis', 'MR Flow Analysis', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 3322.35, 510.6, '800045414', '3D - INT Annual Supp MR Flow Analysis', null, 81),
  ('SYNAPSE-3D', 'HCUS', '16472475', '3D - INT Kidney Analysis', 'Kidney Analysis', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 7155.3, 1145.4, '800045413', '3D - INT Annual Supp Kidney Analysis', null, 82),
  ('SYNAPSE-3D', 'HCUS', '16472487', '3D - INT 4-Chamber Analysis', '4-Chamber Analysis', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 4770.2, 762.45, '800045412', '3D - INT Annual Supp 4-Chamber Analysis', null, 83),
  ('SYNAPSE-3D', 'HCUS', '16472499', '3D - INT Cardiac Ablation Analysis', 'Cardiac Ablation Analysis', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 4770.2, 762.45, '800045411', '3D - INT Annual Supp Cardiac Ablation Analysis', null, 84),
  ('SYNAPSE-3D', 'HCUS', '16472504', '3D - INT Craniotomy/Tensor Analysis', 'Craniotomy/Tensor Analysis', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 7360, 1090.2, '800045410', '3D - INT Annual Supp Craniotomy/Tensor Analysis', null, 85),
  ('SYNAPSE-3D', 'HCUS', '16472516', '3D - INT Tx Map', 'Tx Map', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 3832.95, 612.95, '800045407', '3D - INT Annual Supp Tx Map', null, 86),
  ('SYNAPSE-3D', 'HCUS', '16516403', '3D - INT IVIM', 'IVIM', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 1592.75, 510.6, '800046103', '3D - INT IVIM Annual Support', null, 87),
  ('SYNAPSE-3D', 'HCUS', '16516374', '3D - INT BREAST ANALYSIS', 'BREAST ANALYSIS', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 1592.75, 510.6, '800046104', '3D - INT Breast Analysis Annual Support', null, 88),
  ('SYNAPSE-3D', 'HCUS', '16516386', '3D - INT ENDOSCOPIC SIMULATOR', 'ENDOSCOPIC SIMULATOR', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 5682.15, 510.6, '800046102', '3D - INT Endoscope Simulator Annual Support', null, 89),
  ('SYNAPSE-3D', 'HCUS', '16516398', '3D - INT KIDNEY VOLUMENTRY', 'KIDNEY VOLUMENTRY', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 2065.4, 510.6, '800046101', '3D - INT Kidney Volumetry Annual Support', null, 90),
  ('SYNAPSE-3D', 'HCUS', '16557914', '3D - INT SYN 3D CARD PERFUSION CT GL LIC CCU', 'Cardiac Perfusion CT', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 3829.5, 382.95, '800047035', '3D - INT SYN 3D YRLY SUPT CARD PERFUSION CT', null, 91),
  ('SYNAPSE-3D', 'HCUS', '16557926', '3D - INT SYN 3D CARD PERFUSION MR GL LIC CCU', 'Cardiac Perfusion MR', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 3829.5, 382.95, '800047036', '3D - INT SYN 3D YRLY SUPT CARD PERFUSION MR', null, 92),
  ('SYNAPSE-3D', 'HCUS', '16557938', '3D - INT SYN 3D ABDO PERFUSION CT GL LIC CCU', 'Abdominal Perfusion', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 3829.5, 382.95, '800047037', '3D - INT SYN 3D YRLY SUPT ABDO PERFUSION CT', null, 93),
  ('SYNAPSE-3D', 'HCUS', '16472528', '3D - INT Mobile License', 'Mobile License', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 852.15, 510.6, '800045409', '3D - INT Annual Supp Mobile License', null, 94),
  ('SYNAPSE-3D', 'HCUS', '16798984', '3D - INT SYN 3D GL LIC DUAL ENERGY', 'Per CCU, Optional application(A la carte)', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 3200, 320, '16799029', '3D - INT Annual Supp DUAL ENERGY', null, 95),
  ('SYNAPSE-3D', 'HCUS', '16798996', '3D - INT SYN 3D GL LIC PANCREAS ANALYSIS', 'Per CCU, Optional application(A la carte)', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 6700, 335, '16799031', '3D - INT Annual Supp PANCREAS ANALYSIS', null, 96),
  ('SYNAPSE-3D', 'HCUS', '16799005', '3D - INT SYN 3D GL LIC RECTAL ANALYSIS', 'Per CCU, Optional application(A la carte)', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 7600, 380, '16799043', '3D - INT Annual Supp RECTAL ANALYSIS', null, 97),
  ('SYNAPSE-3D', 'HCUS', '16756704', '3D - INT SYN 3D GL LIC KNEE JOINT ANALYSIS', 'Per CCU, Optional application(A la carte)', 'Synapse 3D Licenses', 'module', 'ccu', null, null, null, 8900, 890, '16819104', '3D - INT Annual Supp KNEE JOINT ANALYSIS', null, 98),
  ('SYNAPSE-3D', 'HCUS', '16902602', 'SYNAPSE3D LIC, SYN3D PIXELSHINE 1CCU GL LIC.', 'PixelShine', 'Synapse 3D Licenses', 'module', 'ccu', 1, null, null, 6300, 1008, '870002749', 'ANN SYN 3D PIXELSHINE 1CCU GL LIC.', null, 99),
  ('SYNAPSE-3D', 'HCUS', '16902614', 'SYNAPSE3D LIC, SYN3D QSM ANLYS 1CCU GL LIC.', 'QSM Analysis', 'Synapse 3D Licenses', 'module', 'ccu', 1, null, null, 6300, 1008, '870002750', 'ANN SYN 3D QSM ANLYS 1CCU GL LIC.', null, 100),
  ('SYNAPSE-3D', 'HCUS', '16823351', 'SYNAPSE3D LIC, SYN3D BRAIN SUBREGION GL LIC.', 'Brain Subregion', 'Synapse 3D Licenses', 'module', 'unit', null, null, null, 4800, 768, '870002753', 'ANN SYN 3D BRAIN SUBREGION GL LIC.', null, 101),
  ('SYNAPSE-MOB', 'HCUS', '800048964', 'INT SYN MOB 2D LIC WITH COLLABO PER 2CCU', 'Mobility - 2D only license with Collaboration - 2CCU Pack *INCLUDES 1 year warranty', 'Synapse Mobility - Full Version', 'module', 'ccu', 2, null, null, 5796, 527.85, '800048972', 'YS 2D LIC WITH COLLABO PER 2CCU', null, 8),
  ('SYNAPSE-MOB', 'HCUS', '800048963', 'INT SYN MOB 3D FULL LIC PER 2CCU', 'Full Version license 2D, 3D, MIP/MPR with Collaboration -2 CCU Pack *INCLUDES 1 year warranty', 'Synapse Mobility - Full Version', 'module', 'ccu', 2, null, null, 7969.5, 724.5, '800048971', 'YS 3D FULL LIC PER 2CCU', null, 9),
  ('SYNAPSE-MOB', 'HCUS', '800048966', 'INT SYN MOB 3D FULL LIC PER 10CCU', 'Full Version license 2D, 3D, MIP/MPR with Collaboration -10 CCU Pack *INCLUDES 1 year warranty', 'Synapse Mobility - Full Version', 'module', 'ccu', 10, null, null, 35190, 3291.3, '800048975', 'YS 3D FULL LIC PER 10CCU', null, 10),
  ('SYNAPSE-MOB', 'HCUS', '800048967', 'INT SYN MOB 3D FULL LIC PER 20CCU', 'Full Version license 2D, 3D, MIP/MPR with Collaboration -20 CCU Pack *INCLUDES 1 year warranty', 'Synapse Mobility - Full Version', 'module', 'ccu', 20, null, null, 62100, 5796, '800048974', 'YS 3D FULL LIC PER 20CCU', null, 11),
  ('SYNAPSE-MOB', 'HCUS', '800048965', 'INT SYN MOB FULL UPGRADE LIC PER 2CCU', 'Mobility - Upgrade license from 2D to FULL version - Per 2CCU. *INCLUDES 1 year warranty', 'Synapse Mobility - Full Version', 'upgrade', 'ccu', 2, null, null, 3208.5, 144.9, '800048973', 'YS FULL UPGRADE LIC PER 2CCU', null, 12),
  ('SYNAPSE-MOB', 'HCUS', '800048968', 'INT SYN MOB FULL UPGRADE PER 10CCU', 'Mobility - Upgrade license from 2D to FULL version - Per 10CCU. *INCLUDES 1 year warranty', 'Synapse Mobility - Full Version', 'upgrade', 'ccu', 10, null, null, 14076, 1314.45, '800048981', 'YS FULL UPGRADE LIC PER 10CCU', null, 13),
  ('SYNAPSE-MOB', 'HCUS', '800048969', 'INT SYN MOB FULL UPGRADE PER 20CCU', 'Mobility - Upgrade license from 2D to FULL version - Per 20CCU. *INCLUDES 1 year warranty', 'Synapse Mobility - Full Version', 'upgrade', 'ccu', 20, null, null, 24840, 2328.75, '800048980', 'YS FULL UPGRADE LIC PER 20CCU', null, 14),
  ('SYNAPSE-MOB', 'HCUS', '800048970', 'INT SYN MOB ENTERPRISE LIC PER 10K', 'Mobility - INT SYN MOBILITY ENTERPRISE LICENSE Per 10K - Full version license (2D/MIP/MPR/3D/Collaboration) *INCLUDES 1 year warranty', 'Synapse Mobility - Full Version', 'module', 'unit', null, null, null, 4347, 414, '800048979', 'YS ENTERPRISE LIC PER 10K', null, 15),
  ('SYNAPSE-MOB', 'HCUS', '800048976', 'INT SYN MOB ENT LIC 10K FOR OPEX (ANNUAL /3 yr minimum)', 'Mobility - Enterprise License (FULL 3D) for 10k studies - Operational Expense Model (Annual Fee) 3 year Minimum requirement', 'Synapse Mobility - OPEX', 'module', 'unit', null, null, null, 1386.9, null, null, null, null, 18),
  ('VMWARE', 'HCUS', '800047137', 'VMWare - INT VMWARE VSPHERE ENTERPRISE PLUS KIT 2 CPU', 'VMWare - INT VMWARE VSPHERE ENTERPRISE PLUS KIT 2 CPU', 'VM Ware 6.14', 'module', 'unit', null, null, null, 6897.61, 689.76, '800047139', 'VMWare - INT VMWARE YRLY SUPT VSPHERE ENT PLUS', null, 10),
  ('VMWARE', 'HCUS', '800044061', 'VMWARE VCENTER SERVER STANDARD', 'VMWARE VCENTER SERVER STANDARD', 'VM Ware 6.14', 'module', 'unit', null, null, null, 5924.8, 592.48, '800021641', 'VMWARE VCENTER SERVER STANDARD SUPPORT AND SUBSCRIPTION SERVICES FOR 1-YEAR', null, 11),
  ('VMWARE', 'HCUS', '800045708', 'VMWARE INT NSX LOAD BALANCER FOR 2-CPUS', 'VMWARE INT NSX LOAD BALANCER FOR 2-CPUS', 'VM Ware 6.14', 'module', 'unit', null, null, null, 2313.8, 386.4, '800045679', 'VMWARE - INT NSX LOAD BALANCER FOR 2 CPUS - 1 YR SUPPORT', null, 12),
  ('VMWARE', 'HCUS', '800045709', 'VMWARE INT VSPHERE STANDARD KIT FOR 2CPU', 'VMWARE INT VSPHERE STANDARD KIT FOR 2CPU', 'VM Ware 6.14', 'module', 'unit', null, null, null, 2516.2, 325.45, '800045681', 'INT VMWARE VSPHERE STANDARD SNS - 1YR', null, 13),
  ('AI-REILI', 'HCUS', '800049483', 'INT SYN AIPF LICENSE PER DB', 'INT SYN AIPF LICENSE PER DB', 'AI REiLI version', 'module', 'unit', null, null, null, 5750, 575, '870001300', 'INT SYN AIPF YRLY SUPP LICENSE PER DB', null, 10),
  ('AI-REILI', 'HCUS', '800049484', 'INT SYN AIPF INTEGRATION PER MODULE', 'INT SYN AIPF INTEGRATION PER MODULE', 'AI REiLI version', 'service', 'unit', null, null, null, 3450, 345, '870001301', 'INT SYN AIPF YRLY SUPP INTEGRATION PER MODULE', null, 11),
  ('AVICENNA', 'HCUS', '800052410', 'AIPF - INT EU AVICENNA AI ICH (1K-6K)', 'AIPF - INT EU AVICENNA AI ICH (1K-6K)', 'Volume Based License', 'module', 'study', null, 1000, 6000, 0.72, null, null, null, null, 12),
  ('AVICENNA', 'HCUS', '800052409', 'AIPF - INT EU AVICENNA AI ICH-ASPECTS (1K-6K)', 'AIPF - INT EU AVICENNA AI ICH-ASPECTS (1K-6K)', 'Volume Based License', 'module', 'study', null, 1000, 6000, 1.74, null, null, null, null, 13),
  ('AVICENNA', 'HCUS', '800052405', 'AIPF - INT EU AVICENNA AI ICH-LVO (1K-6K)', 'AIPF - INT EU AVICENNA AI ICH-LVO (1K-6K)', 'Volume Based License', 'module', 'study', null, 1000, 6000, 4.53, null, null, null, null, 14),
  ('AVICENNA', 'HCUS', '800052413', 'AIPF - INT EU AVICENNA AI ICH-LVO-ASPECTS (1K-6K)', 'AIPF - INT EU AVICENNA AI ICH-LVO-ASPECTS (1K-6K)', 'Volume Based License', 'module', 'study', null, 1000, 6000, 5.37, null, null, null, null, 15),
  ('AVICENNA', 'HCUS', '800052408', 'AIPF - INT EU AVICENNA AI ICH (6K-10K)', 'AIPF - INT EU AVICENNA AI ICH (6K-10K)', 'Volume Based License', 'module', 'study', null, 6000, 10000, 0.63, null, null, null, null, 18),
  ('AVICENNA', 'HCUS', '800052404', 'AIPF - INT EU AVICENNA AI ICH-ASPECTS (6K-10K)', 'AIPF - INT EU AVICENNA AI ICH-ASPECTS (6K-10K)', 'Volume Based License', 'module', 'study', null, 6000, 10000, 1.51, null, null, null, null, 19),
  ('AVICENNA', 'HCUS', '800052400', 'AIPF - INT EU AVICENNA AI ICH-LVO (6K-10K)', 'AIPF - INT EU AVICENNA AI ICH-LVO (6K-10K)', 'Volume Based License', 'module', 'study', null, 6000, 10000, 3.96, null, null, null, null, 20),
  ('AVICENNA', 'HCUS', '800052407', 'AIPF - INT EU AVICENNA AI ICH-LVO-ASPECTS (6K-10K)', 'AIPF - INT EU AVICENNA AI ICH-LVO-ASPECTS (6K-10K)', 'Volume Based License', 'module', 'study', null, 6000, 10000, 4.7, null, null, null, null, 21),
  ('AVICENNA', 'HCUS', '800052406', 'AIPF - INT EU AVICENNA AI ICH (10K-15K)', 'AIPF - INT EU AVICENNA AI ICH (10K-15K)', 'Volume Based License', 'module', 'study', null, 10000, 15000, 0.58, null, null, null, null, 24),
  ('AVICENNA', 'HCUS', '800052402', 'AIPF - INT EU AVICENNA AI ICH-ASPECTS (10K-15K)', 'AIPF - INT EU AVICENNA AI ICH-ASPECTS (10K-15K)', 'Volume Based License', 'module', 'study', null, 10000, 15000, 1.37, null, null, null, null, 25),
  ('AVICENNA', 'HCUS', '800052399', 'AIPF - INT EU AVICENNA AI ICH-LVO (10K-15K)', 'AIPF - INT EU AVICENNA AI ICH-LVO (10K-15K)', 'Volume Based License', 'module', 'study', null, 10000, 15000, 3.67, null, null, null, null, 26),
  ('AVICENNA', 'HCUS', '800052397', 'AIPF - INT EU AVICENNA AI ICH-LVO-ASPECTS 10K-15K', 'AIPF - INT EU AVICENNA AI ICH-LVO-ASPECTS 10K-15K', 'Volume Based License', 'module', 'study', null, 10000, 15000, 4.33, null, null, null, null, 27),
  ('AVICENNA', 'HCUS', '800052398', 'AIPF - INT EU AVICENNA AI ICH (15K-50K)', 'AIPF - INT EU AVICENNA AI ICH (15K-50K)', 'Volume Based License', 'module', 'study', null, 15000, 50000, 0.32, null, null, null, null, 30),
  ('AVICENNA', 'HCUS', '800052392', 'AIPF - INT EU AVICENNA AI ICH-ASPECTS (15K-50K)', 'AIPF - INT EU AVICENNA AI ICH-ASPECTS (15K-50K)', 'Volume Based License', 'module', 'study', null, 15000, 50000, 0.68, null, null, null, null, 31),
  ('AVICENNA', 'HCUS', '800052394', 'AIPF - INT EU AVICENNA AI ICH-LVO (15K-50K)', 'AIPF - INT EU AVICENNA AI ICH-LVO (15K-50K)', 'Volume Based License', 'module', 'study', null, 15000, 50000, 1.91, null, null, null, null, 32),
  ('AVICENNA', 'HCUS', '800052395', 'AIPF - INT EU AVICENNA AI ICH-LVO-ASPEC (15K-50K)', 'AIPF - INT EU AVICENNA AI ICH-LVO-ASPEC (15K-50K)', 'Volume Based License', 'module', 'study', null, 15000, 50000, 2.26, null, null, null, null, 33),
  ('AVICENNA', 'HCUS', '800052389', 'AIPF - INT EU AVICENNA AI ICH (50K-100K)', 'AIPF - INT EU AVICENNA AI ICH (50K-100K)', 'Volume Based License', 'module', 'study', null, 50000, 100000, 0.23, null, null, null, null, 36),
  ('AVICENNA', 'HCUS', '800052401', 'AIPF - INT EU AVICENNA AI ICH-ASPECTS(50K-100K)', 'AIPF - INT EU AVICENNA AI ICH-ASPECTS(50K-100K)', 'Volume Based License', 'module', 'study', null, 50000, 100000, 0.49, null, null, null, null, 37),
  ('AVICENNA', 'HCUS', '800052387', 'AIPF - INT EU AVICENNA AI ICH-LVO (50K-100K)', 'AIPF - INT EU AVICENNA AI ICH-LVO (50K-100K)', 'Volume Based License', 'module', 'study', null, 50000, 100000, 1.37, null, null, null, null, 38),
  ('AVICENNA', 'HCUS', '800052393', 'AIPF - INT EU AVICENNA AI ICH-LVO-ASPEC (50K-100K)', 'AIPF - INT EU AVICENNA AI ICH-LVO-ASPEC (50K-100K)', 'Volume Based License', 'module', 'study', null, 50000, 100000, 1.61, null, null, null, null, 39),
  ('AVICENNA', 'HCUS', '800052390', 'AIPF - INT EU AVICENNA AI ICH (100K+)', 'AIPF - INT EU AVICENNA AI ICH (100K+)', 'Volume Based License', 'module', 'study', null, 100000, null, 0.18, null, null, null, null, 42),
  ('AVICENNA', 'HCUS', '800052386', 'AIPF - INT EU AVICENNA AI ICH-ASPECTS (100K+)', 'AIPF - INT EU AVICENNA AI ICH-ASPECTS (100K+)', 'Volume Based License', 'module', 'study', null, 100000, null, 0.37, null, null, null, null, 43),
  ('AVICENNA', 'HCUS', '800052391', 'AIPF - INT EU AVICENNA AI ICH-LVO (100K+)', 'AIPF - INT EU AVICENNA AI ICH-LVO (100K+)', 'Volume Based License', 'module', 'study', null, 100000, null, 1.05, null, null, null, null, 44),
  ('AVICENNA', 'HCUS', '800052385', 'AIPF - INT EU AVICENNA AI ICH-LVO-ASPECTS (100K+)', 'AIPF - INT EU AVICENNA AI ICH-LVO-ASPECTS (100K+)', 'Volume Based License', 'module', 'study', null, 100000, null, 1.25, null, null, null, null, 45),
  ('AVICENNA', 'HCUS', '800052388', 'AIPF - INT EU AVICENNA AI ENTERPRISE ICH (1YR)', 'AIPF - INT EU AVICENNA AI ENTERPRISE ICH (1YR)', 'Volume Based License', 'module', 'unit', null, null, null, 8107.02, null, null, null, null, 48),
  ('AVICENNA', 'HCUS', '800052384', 'AIPF - INT EU AVICENNA AI ENTERPRISE LVO (1YR)', 'AIPF - INT EU AVICENNA AI ENTERPRISE LVO (1YR)', 'Volume Based License', 'module', 'unit', null, null, null, 45940.35, null, null, null, null, 49),
  ('AVICENNA', 'HCUS', '800052403', 'AIPF - INT EU AVICENNA AI ENTERPRISE ASPECTS (1YR)', 'AIPF - INT EU AVICENNA AI ENTERPRISE ASPECTS (1YR)', 'Volume Based License', 'module', 'unit', null, null, null, 12161.4, null, null, null, null, 50),
  ('AVICENNA', 'HCUS', '800052383', 'AIPF - INT EU AVICENNA AI ENTERPRISE ICH-LVO (1YR)', 'AIPF - INT EU AVICENNA AI ENTERPRISE ICH-LVO (1YR)', 'Volume Based License', 'module', 'unit', null, null, null, 49112.28, null, null, null, null, 51),
  ('AVICENNA', 'HCUS', '800052382', 'AIPF - INT EU AVICENNA AI ENTERPRISE ICH-LVO-ASPECTS (1YR)', 'AIPF - INT EU AVICENNA AI ENTERPRISE ICH-LVO-ASPECTS (1YR)', 'Volume Based License', 'module', 'unit', null, null, null, 58263.16, null, null, null, null, 52),
  ('AVICENNA', 'HCUS', '800052396', 'AIPF - INT EU AVICENNA AI ENTERPRISE ICH (3YRS)', 'AIPF - INT EU AVICENNA AI ENTERPRISE ICH (3YRS)', 'Volume Based License', 'module', 'unit', null, null, null, 7701.75, null, null, null, null, 55),
  ('AVICENNA', 'HCUS', '800052381', 'AIPF - INT EU AVICENNA AI ENTERPRISE LVO (3YRS)', 'AIPF - INT EU AVICENNA AI ENTERPRISE LVO (3YRS)', 'Volume Based License', 'module', 'unit', null, null, null, 43642.11, null, null, null, null, 56),
  ('AVICENNA', 'HCUS', '800052380', 'AIPF - INT EU AVICENNA AI ENTERPRISE ASPECTS (3YRS)', 'AIPF - INT EU AVICENNA AI ENTERPRISE ASPECTS (3YRS)', 'Volume Based License', 'module', 'unit', null, null, null, 11552.63, null, null, null, null, 57),
  ('AVICENNA', 'HCUS', '800052411', 'AIPF - INT EU AVICENNA AI ENTERPRISE ICH-LVO (3YRS)', 'AIPF - INT EU AVICENNA AI ENTERPRISE ICH-LVO (3YRS)', 'Volume Based License', 'module', 'unit', null, null, null, 46656.14, null, null, null, null, 58),
  ('AVICENNA', 'HCUS', '800052412', 'AIPF - INT EU AVICENNA AI ENTERPRISE ICH-LVO-ASPECTS (3YRS)', 'AIPF - INT EU AVICENNA AI ENTERPRISE ICH-LVO-ASPECTS (3YRS)', 'Volume Based License', 'module', 'unit', null, null, null, 55349.12, null, null, null, null, 59),
  ('AVICENNA', 'HCUS', '800052379', 'AIPF - INT EU AVICENNA AI STANDALONE ICH', 'AIPF - INT EU AVICENNA AI STANDALONE ICH', 'Volume Based License', 'module', 'unit', null, null, null, 2273.68, null, null, null, null, 62),
  ('AVICENNA', 'HCUS', '800052378', 'AIPF - INT EU AVICENNA AI STANDALONE LVO', 'AIPF - INT EU AVICENNA AI STANDALONE LVO', 'Volume Based License', 'module', 'unit', null, null, null, 9473.68, null, null, null, null, 63),
  ('AVICENNA', 'HCUS', '800052377', 'AIPF - INT EU AVICENNA AI STANDALONE ASPECTS', 'AIPF - INT EU AVICENNA AI STANDALONE ASPECTS', 'Volume Based License', 'module', 'unit', null, null, null, 3410.53, null, null, null, null, 64),
  ('AVICENNA', 'HCUS', '800052376', 'AIPF - INT EU AVICENNA AI STANDALONE ICH-LVO', 'AIPF - INT EU AVICENNA AI STANDALONE ICH-LVO', 'Volume Based License', 'module', 'unit', null, null, null, 11159.65, null, null, null, null, 65),
  ('AVICENNA', 'HCUS', '800052416', 'AIPF - INT EU AVICENNA AI STANDALONE ICH-LVO-ASPECTS', 'AIPF - INT EU AVICENNA AI STANDALONE ICH-LVO-ASPECTS', 'Volume Based License', 'module', 'unit', null, null, null, 13945.61, null, null, null, null, 66),
  ('SYN-PATH', 'HCUS', '800052478', 'DPath - INT PATHOLOGY-SFWR-001 CAPITAL', 'Digital Pathology CAPITAL - Software and 3rd & 4th Line Support First Year Only Per Pathologist-Protected Territory', 'Synapse Pathology', 'module', 'user', null, null, null, 10500, 1750, '870002556', 'DPath - INT DP-SFWR-002 SUPPORT', null, 8),
  ('SYN-PATH', 'HCUS', '800052476', 'D Path - INT Pathology-SFWR-003 OPEX', 'Annual -Software and 3rd & 4th Line Support Per Pathologist-Protected Territory', 'Synapse Pathology', 'module', 'user', null, null, null, 3500, null, null, null, null, 9),
  ('CONTEXTFLOW', 'HCUS', null, 'CFACCT_BASIC', 'ADVANCE Chest CT - Basic without any prior', 'Contextflow Parts Number', 'module', 'study', null, null, null, 0.7, null, null, null, null, 8),
  ('CONTEXTFLOW', 'HCUS', null, 'CFACCT_LNT_1PRIORS', 'ADVANCE Chest CT - Lung Nodule Timeline 1 prior', 'Contextflow Parts Number', 'module', 'study', null, null, null, 1.4, null, null, null, null, 9),
  ('CONTEXTFLOW', 'HCUS', null, 'CFACCT_LNT_2PRIORS', 'ADVANCE Chest CT - Lung Nodule Timeline 2 priors', 'Contextflow Parts Number', 'module', 'study', null, null, null, 2.1, null, null, null, null, 10),
  ('CONTEXTFLOW', 'HCUS', null, 'CFACCT_LNT_3PRIORS', 'ADVANCE Chest CT - Lung Nodule Timeline 3 priors', 'Contextflow Parts Number', 'module', 'study', null, null, null, 2.8, null, null, null, null, 11),
  ('CONTEXTFLOW', 'HCUS', null, 'CFACCT_LNT_4+PRIORS', 'ADVANCE Chest CT - Lung Nodule Timeline 4 and more priors', 'Contextflow Parts Number', 'module', 'study', null, null, null, 3.5, null, null, null, null, 12),
  ('CONTEXTFLOW', 'HCUS', null, 'CFACCT_IPE', 'ADVANCE Chest CT - Incidental Pulmonary Embolism', 'Contextflow Parts Number', 'module', 'study', null, null, null, 0.7, null, null, null, null, 13),
  ('CONTEXTFLOW', 'HCUS', null, 'CFACCT_PROFESSIONAL', 'ADVANCE Chest CT - Professional: DICOM SC with segmentation of 7 patterns', 'Contextflow Parts Number', 'module', 'study', null, null, null, 2.45, null, null, null, null, 14),
  ('CONTEXTFLOW', 'HCUS', null, 'CFACCTT_SEARCH', 'ADVANCE Chest CT - Search', 'Contextflow Parts Number', 'module', 'study', null, null, null, 0.7, null, null, null, null, 15),
  ('GLEAMER', 'HCUS', null, 'BONE VIEW PKG 1-5,000', 'Package - Trauma Plain Films 1 - 5,000 per year', 'GLEAMER Parts Number', 'package', 'unit', null, 1, 5000, 4200, null, null, null, null, 8),
  ('GLEAMER', 'HCUS', null, 'BONE VIEW PKG 5,001-10,000', 'Package - Trauma Plain Films 5,001 - 10,000 per year', 'GLEAMER Parts Number', 'package', 'unit', null, 5001, 10000, 8050, null, null, null, null, 9),
  ('GLEAMER', 'HCUS', null, 'BONE VIEW PKG 10,001-15,000', 'Package - Trauma Plain Films 10,001 - 15,000 per year', 'GLEAMER Parts Number', 'package', 'unit', null, 10001, 15000, 11550, null, null, null, null, 10),
  ('GLEAMER', 'HCUS', null, 'BONE VIEW PKG 15,001-20,000', 'Package - Trauma Plain Films 15,001 - 20,000 per year', 'GLEAMER Parts Number', 'package', 'unit', null, 15001, 20000, 14700, null, null, null, null, 11),
  ('GLEAMER', 'HCUS', null, 'BONE VIEW PKG 20,001-25,000', 'Package - Trauma Plain Films 20,001 - 25,000 per year', 'GLEAMER Parts Number', 'package', 'unit', null, 20001, 25000, 17500, null, null, null, null, 12),
  ('GLEAMER', 'HCUS', null, 'BONE VIEW PKG 25,001-30,000', 'Package - Trauma Plain Films 25,001 - 30,000 per year', 'GLEAMER Parts Number', 'package', 'unit', null, 25001, 30000, 19950, null, null, null, null, 13),
  ('GLEAMER', 'HCUS', null, 'BONE VIEW PKG 30,001-35,000', 'Package - Trauma Plain Films 30,001 - 35,000 per year', 'GLEAMER Parts Number', 'package', 'unit', null, 30001, 35000, 22050, null, null, null, null, 14),
  ('GLEAMER', 'HCUS', null, 'BONE VIEW PKG 35,001-40,000', 'Package - Trauma Plain Films 35,001 - 40,000 per year', 'GLEAMER Parts Number', 'package', 'unit', null, 35001, 40000, 23800, null, null, null, null, 15),
  ('GLEAMER', 'HCUS', null, 'BONE VIEW PKG 40,001-45,000', 'Package - Trauma Plain Films 40,001 - 45,000 per year', 'GLEAMER Parts Number', 'package', 'unit', null, 40001, 45000, 25200, null, null, null, null, 16),
  ('GLEAMER', 'HCUS', null, 'BONE VIEW PKG 45,001-50,000', 'Package - Trauma Plain Films 45,001 - 50,000 per year', 'GLEAMER Parts Number', 'package', 'unit', null, 45001, 50000, 26250, null, null, null, null, 17),
  ('IBEX', 'HCUS', null, 'IBEX PROSTATE H&E PER CASE', 'Ibex Prostate H&E application Per CASE', 'IBEX Parts Number', 'module', 'case', null, null, null, 16.09, null, null, null, null, 8),
  ('IBEX', 'HCUS', null, 'IBEX BREAST H&E PER CASE', 'Ibex Breast H&E application Per CASE', 'IBEX Parts Number', 'module', 'case', null, null, null, 10.06, null, null, null, null, 9),
  ('IBEX', 'HCUS', null, 'IBEX BREAST HER2 PER CASE', 'Ibex Breast HER2 application Per CASE', 'IBEX Parts Number', 'module', 'case', null, null, null, 4.76, null, null, null, null, 10),
  ('IBEX', 'HCUS', null, 'IBEX GASTRIC H&E PER CASE', 'Ibex Gastric H&E application Per CASE', 'IBEX Parts Number', 'module', 'case', null, null, null, 7.51, null, null, null, null, 11),
  ('IBEX', 'HCUS', null, 'PROF SERVICE BY IBEX FOR 1ST TIME', 'First Time implementation/Training by IBEX', 'IBEX Parts Number', 'service', 'unit', null, null, null, 15000, null, null, null, null, 12),
  ('IBEX', 'HCUS', null, 'PROF SERVICE BY IBEX PER ADD MODULE', 'Implementation/Training by IBEX per Additional Module', 'IBEX Parts Number', 'service', 'unit', null, null, null, 7500, null, null, null, null, 13),
  ('IBEX', 'HCUS', null, 'LIS REPORT INTEGRATION BY IBEX', 'LIS/reporting integration by IBEX', 'IBEX Parts Number', 'service', 'unit', null, null, null, 9000, null, null, null, null, 14),
  ('IBEX', 'HCUS', null, 'ADD LIS REPORT INTEGRATION BY IBEX', 'Additional Site/Location, LIS integration by IBEX', 'IBEX Parts Number', 'service', 'unit', null, null, null, 7500, null, null, null, null, 15),
  ('DP-EXT', 'HCUS', null, 'DP ANALYTICS BI USER EXTENTIAL', 'DP ANALYTICS BI USER EXTENTIAL', 'EXTENTIAL Parts Number', 'module', 'user', null, null, null, 2730, null, null, null, null, 8),
  ('DP-EXT', 'HCUS', null, 'DP ANALYTICS BI ADMIN EXTENTIAL', 'DP ANALYTICS BI ADMIN EXTENTIAL', 'EXTENTIAL Parts Number', 'module', 'user', null, null, null, 13650, null, null, null, null, 9),
  ('DP-EXT', 'HCUS', null, 'ANN DP ANALYTICS BI USER EXTENTIAL', 'ANN DP ANALYTICS BI USER EXTENTIAL', 'EXTENTIAL Parts Number', 'module', 'user', null, null, null, 682.5, null, null, null, null, 10),
  ('DP-EXT', 'HCUS', null, 'ANN DP ANALYTICS BI ADMIN EXTENTIAL', 'ANN DP ANALYTICS BI ADMIN EXTENTIAL', 'EXTENTIAL Parts Number', 'module', 'user', null, null, null, 3412.5, null, null, null, null, 11),
  ('DP-EXT', 'HCUS', null, 'OPEX DP ANALYTICS BI USER EXTENTIAL', 'OPEX DP ANALYTICS BI USER EXTENTIAL', 'EXTENTIAL Parts Number', 'module', 'user', null, null, null, 1592.5, null, null, null, null, 12),
  ('DP-EXT', 'HCUS', null, 'OPEX DP ANALYTICS BI ADMIN EXTENTIAL', 'OPEX DP ANALYTICS BI ADMIN EXTENTIAL', 'EXTENTIAL Parts Number', 'module', 'user', null, null, null, 7962.5, null, null, null, null, 13),
  ('DP-EXT', 'HCUS', null, 'DP REPORTING USER EXTENTIAL', 'DP REPORTING USER EXTENTIAL', 'EXTENTIAL Parts Number', 'module', 'user', null, null, null, 2730, null, null, null, null, 14),
  ('DP-EXT', 'HCUS', null, 'DP REPORTING ADMIN EXTENTIAL', 'DP REPORTING ADMIN EXTENTIAL', 'EXTENTIAL Parts Number', 'module', 'user', null, null, null, 13650, null, null, null, null, 15),
  ('DP-EXT', 'HCUS', null, 'ANN DP REPORTING USER EXTENTIAL', 'ANN DP REPORTING USER EXTENTIAL', 'EXTENTIAL Parts Number', 'module', 'user', null, null, null, 682.5, null, null, null, null, 16),
  ('DP-EXT', 'HCUS', null, 'ANN DP REPORTING ADMIN EXTENTIAL', 'ANN DP REPORTING ADMIN EXTENTIAL', 'EXTENTIAL Parts Number', 'module', 'user', null, null, null, 3412.5, null, null, null, null, 17),
  ('DP-EXT', 'HCUS', null, 'OPEX DP REPORTING USER EXTENTIAL', 'OPEX DP REPORTING USER EXTENTIAL', 'EXTENTIAL Parts Number', 'module', 'user', null, null, null, 1592.5, null, null, null, null, 18),
  ('DP-EXT', 'HCUS', null, 'OPEX DP REPORTING ADMIN EXTENTIAL', 'OPEX DP REPORTING ADMIN EXTENTIAL', 'EXTENTIAL Parts Number', 'module', 'user', null, null, null, 7962.5, null, null, null, null, 19),
  ('LUNIT', 'HCUS', null, 'Lunit CXR License (Tier 1 - 1K)', 'Lunit CXR License (Tier 1 - 1K)', 'FEN Parts Description', 'module', 'study', null, 0, 1000, 0.78, null, null, null, null, 9),
  ('LUNIT', 'HCUS', null, 'Lunit CXR License (Tier 2 - 9K)', 'Lunit CXR License (Tier 2 - 9K)', 'FEN Parts Description', 'module', 'study', null, 1001, 9000, 0.63, null, null, null, null, 10),
  ('LUNIT', 'HCUS', null, 'Lunit CXR License (Tier 3 - 90K)', 'Lunit CXR License (Tier 3 - 90K)', 'FEN Parts Description', 'module', 'study', null, 9001, 90000, 0.47, null, null, null, null, 11),
  ('LUNIT', 'HCUS', null, 'Lunit CXR License (Tier 4 - 900K)', 'Lunit CXR License (Tier 4 - 900K)', 'FEN Parts Description', 'module', 'study', null, 90001, 900000, 0.24, null, null, null, null, 12),
  ('LUNIT', 'HCUS', null, 'Lunit MMG License (Tier 1 - 1K)', 'Lunit MMG License (Tier 1 - 1K)', 'FEN Parts Description', 'module', 'study', null, 0, 1000, 1.37, null, null, null, null, 20),
  ('LUNIT', 'HCUS', null, 'Lunit MMG License (Tier 2 - 9K)', 'Lunit MMG License (Tier 2 - 9K)', 'FEN Parts Description', 'module', 'study', null, 1001, 9000, 1.1, null, null, null, null, 21),
  ('LUNIT', 'HCUS', null, 'Lunit MMG License (Tier 3 - 20K)', 'Lunit MMG License (Tier 3 - 20K)', 'FEN Parts Description', 'module', 'study', null, 9001, 20000, 0.82, null, null, null, null, 22),
  ('LUNIT', 'HCUS', null, 'Lunit MMG License (Tier 4 - 90K)', 'Lunit MMG License (Tier 4 - 90K)', 'FEN Parts Description', 'module', 'study', null, 20001, 90000, 0.42, null, null, null, null, 23),
  ('LUNIT', 'HCUS', null, 'Lunit MMG 2D+3D License (Tier 1 - 1K)', 'Lunit MMG 2D+3D License 0 - 1,000 per year', 'FEN Parts Description', 'module', 'study', null, 0, 1000, 1.79, null, null, null, null, 32),
  ('LUNIT', 'HCUS', null, 'Lunit MMG 2D+3D License (Tier 2 - 10K)', 'Lunit MMG 2D+3D License 1,001 - 10,000 per year', 'FEN Parts Description', 'module', 'study', null, 1001, 10000, 1.47, null, null, null, null, 33),
  ('LUNIT', 'HCUS', null, 'Lunit MMG 2D+3D License (Tier 3 - 30K)', 'Lunit MMG 2D+3D License 10,001 - 30,000 per year', 'FEN Parts Description', 'module', 'study', null, 10001, 30000, 1.21, null, null, null, null, 34),
  ('LUNIT', 'HCUS', null, 'Lunit MMG 2D+3D License (Tier 4 - 120K)', 'Lunit MMG 2D+3D License 30,001 - 120,000 per year', 'FEN Parts Description', 'module', 'study', null, 30001, 120000, 0.71, null, null, null, null, 35),
  ('AI-GATEWAY', 'HCUS', '70100171839', 'AIG BASE LICENSE INCL ONE MODULE', 'AI Gateway Base Lincense including one Module License(Initial)', 'Item Code', 'module', 'unit', null, null, null, 30000, null, null, null, null, 14),
  ('AI-GATEWAY', 'HCUS', '70100171849', 'ANN AIG BASE LICENSE INCL ONE MODULE', 'AI Gateway Base Lincense including one Module License(Annual)', 'Item Code', 'module', 'unit', null, null, null, 6000, null, null, null, null, 15),
  ('AI-GATEWAY', 'HCUS', '70100171856', 'AIG ADD MODULE LICENSE PER MODULE', 'AI Gateway additional Module License per Module(Initial)', 'Item Code', 'module', 'unit', null, null, null, 8000, null, null, null, null, 16),
  ('AI-GATEWAY', 'HCUS', '70100171843', 'ANN AIG ADD MODULE LICENSE PER MODULE', 'AI Gateway additional Module License per Module(Annual)', 'Item Code', 'module', 'unit', null, null, null, 1600, null, null, null, null, 17),
  ('AI-GATEWAY', 'HCUS', '70100171845', 'AIG ANONYMIZER LICENSE', 'AI Gateway Anonymizer License - Single or nothing (Initial)', 'Item Code', 'module', 'unit', null, null, null, 8000, null, null, null, null, 18),
  ('AI-GATEWAY', 'HCUS', '70100171836', 'ANN AIG ANONYMIZER LICENSE', 'AI Gateway Anonymizer License - Single or nothing(Annual)', 'Item Code', 'module', 'unit', null, null, null, 1600, null, null, null, null, 19),
  ('AI-GATEWAY', 'HCUS', '70100171850', 'AIG OUTSOURCING LIC PER CONNECTION', 'AI Gateway Outsourcing License per Connection (Initial)', 'Item Code', 'module', 'unit', null, null, null, 8000, null, null, null, null, 20),
  ('AI-GATEWAY', 'HCUS', '70100171852', 'ANN AIG OUTSOURCING LIC PER CONNECTION', 'AI Gateway Outsourcing License per Connection (Annual)', 'Item Code', 'module', 'unit', null, null, null, 1600, null, null, null, null, 21),
  ('AI-GATEWAY', 'HCUS', '70100171838', 'AIG HOSTED ON EU AWS CLOUD YEARLY', 'AI Gateway hosted on EU''s AWS cloud', 'Item Code', 'module', 'unit', null, null, null, 1500, null, null, null, null, 22);

-- Link each family to its catalogue product where the SKU already matches.
-- Anything left unlinked is listed by the select at the bottom for you to map
-- in the Products screen — the seed never invents catalogue rows.
update public.product_items i set product_id = p.id
from public.products p
where i.product_id is null and (
     (i.family_code = 'SYNAPSE-3D'   and p.sku ilike 'S3D%')
  or (i.family_code = 'SYNAPSE-PACS' and (p.sku ilike 'SYN-PACS%' or p.name ilike '%synapse pacs%'))
  or (i.family_code = 'SYNAPSE-MOB'  and p.name ilike '%mobility%')
  or (i.family_code = 'SYN-PATH'     and p.name ilike '%patholog%')
  or (i.family_code = 'AI-REILI'     and p.name ilike '%reili%')
  or (i.family_code = 'AVICENNA'     and p.name ilike '%avicenna%')
  or (i.family_code = 'GLEAMER'      and p.name ilike '%gleamer%')
  or (i.family_code = 'LUNIT'        and p.name ilike '%lunit%')
  or (i.family_code = 'IBEX'         and p.name ilike '%ibex%')
  or (i.family_code = 'CONTEXTFLOW'  and p.name ilike '%contextflow%')
  or (i.family_code = 'AI-GATEWAY'   and p.name ilike '%ai gateway%')
  or (i.family_code = 'VMWARE'       and p.name ilike '%vmware%')
);

-- Everything on this list is bought from HCUS.
update public.products set supplier_code = 'HCUS'
where supplier_code is null
  and id in (select product_id from public.product_items where product_id is not null);

-- What still needs a catalogue product, and which products still have no supplier.
select family_code, count(*) as unlinked_items
from public.product_items where product_id is null
group by family_code order by family_code;

select sku, name, brand, supplier_code from public.products
where supplier_code is null order by name;
