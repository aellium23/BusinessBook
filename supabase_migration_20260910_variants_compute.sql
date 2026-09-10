-- Conditional prices, and the Oracle licence the price list assumes.
--
-- The HCUS list carries the same VNA licence twice: 4,168.75 on its own and
-- 2,084.95 when it is bought alongside Synapse PACS. That is not two products,
-- it is one product at two prices depending on a fact about the site, so it is
-- modelled as variants of one item rather than left for the rep to remember.
--
-- Safe to run more than once.

alter table public.product_items add column if not exists variant_group text;
alter table public.product_items add column if not exists variant text
  check (variant is null or variant in ('standalone','bundle'));

create index if not exists product_items_variant_idx
  on public.product_items(variant_group) where variant_group is not null;

update public.product_items set variant_group = null, variant = null
where price_list = 'HCUS MI SUB 2026 V7.5';

update public.product_items set variant_group = 'VNA-DICOM-10K', variant = 'standalone'
where name = 'VNA DICOM LIC 10K STUDIES';
update public.product_items set variant_group = 'VNA-DICOM-10K', variant = 'bundle'
where name = 'VNA DICOM LIC FOR 10K PACS';

update public.product_items set variant_group = 'VNA-NONDICOM', variant = 'standalone'
where name = 'VNA NON-DICOM LIC PER DEPARTMENT';
update public.product_items set variant_group = 'VNA-NONDICOM', variant = 'bundle'
where name = 'VNA NON-DICOM LIC FOR 10K PACS';

-- Synapse runs on Oracle and the licence is sold per 10k studies like the PACS
-- licence itself, but the SKU name reads "COMPUTE STD 10K" rather than "for
-- each 10k studies", so the loader filed it as a flat unit and it did not scale
-- with volume. A 50k-study site needs five, not one.
update public.product_items set unit = 'block_10k'
where price_list = 'HCUS MI SUB 2026 V7.5'
  and name in ('COMPUTE STD 10K LIC FTYO', 'COMPUTE ENT 10K LIC FTYO',
               'COMPUTE STD 10K LIC CNV FTYO (CONVERSION)',
               'COMPUTE ENT 10K LIC CNV FTYO (CONVERSION)');

-- Standard is what we quote. Enterprise stays in the list for the rare site
-- that needs it, but is never the default.
update public.product_items set is_default = true
where name = 'COMPUTE STD 10K LIC FTYO';

select family_code, name, unit, variant_group, variant, is_default, transfer_price
from public.product_items
where is_default or variant_group is not null
order by family_code, variant_group nulls first, variant;
