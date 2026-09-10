-- Which SKU a family quotes by default.
--
-- Picking Synapse PACS left the cost at zero: the family's SKUs are volume
-- driven, but nothing selected one, so the rep had to open the price list and
-- find the base licence before any number appeared. The core licence of a
-- family is not a judgement call — it is the thing you always buy — so it is
-- marked here and pre-selected in the quote.
--
-- Safe to run more than once.

alter table public.product_items add column if not exists is_default boolean not null default false;

update public.product_items set is_default = false;

update public.product_items set is_default = true
where price_list = 'HCUS MI SUB 2026 V7.5' and name in (
  -- Billed per 10k studies, so the study volume alone gives a real cost.
  'PACS BASE LIC FOR EACH 10K STUDIES',
  -- The standalone VNA. The PACS-bundled licence costs us half as much
  -- (2,084.95 against 4,168.75), but bundling is a commercial decision, so it
  -- stays a deliberate choice in the drill-down rather than a silent default.
  'VNA DICOM LIC 10K STUDIES'
);

select family_code, name, unit, transfer_price, annual_support
from public.product_items where is_default order by family_code;
