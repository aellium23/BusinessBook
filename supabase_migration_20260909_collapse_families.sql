-- Collapse the Synapse 3D catalogue into one family, assign suppliers, and
-- repair the item links.
--
-- `products` held ~80 rows for Synapse 3D — every à-la-carte module and every
-- CCU package as its own catalogue entry. That is the list a rep scrolls when
-- building a deal, and it is why building one takes minutes instead of seconds.
-- The 84 rows loaded from the HCUS price list describe the same licences with
-- the cost, SAP number and CCU capacity that `products` has nowhere to put, so
-- the two now overlap.
--
-- The old rows are deactivated, never deleted: `deal_products` references them
-- by id and also stores `product_name`, so history stays readable either way,
-- and a deactivation is reversible where a delete is not.
--
-- Safe to run more than once.

-- ── 1. Who we buy from ──────────────────────────────────────────────────────
-- Only the unambiguous assignments. Ciberbit, Vocali, Nuance, Divultec, Medbox,
-- MedCd, SaaS, SERVICES and General Hardware are deliberately left null.
update public.products set supplier_code = 'HCUS'
where supplier_code is null and (
     sku ilike 'S3D-%' or sku ilike 'SYN-%'  or sku ilike 'REILI-%'
  or sku ilike 'LUNIT-%' or sku ilike 'GLEAM%' or sku ilike 'IBEX-%'
  or sku ilike 'DPE-%'   or sku ilike 'VMW-%'  or sku = 'SYNPATH-AI'
);

update public.products set supplier_code = 'VGT'
where supplier_code is null and sku ilike 'CWM-%';

update public.products set supplier_code = 'MEDSKY'
where supplier_code is null and sku ilike 'MEDSKY-%';

-- ── 2. One catalogue entry for Synapse 3D ───────────────────────────────────
-- Category and BU are inherited from the rows being replaced rather than
-- invented, so the family lands where the modules already lived.
insert into public.products
  (category, sku, name, description, bu, supplier_code, active, sort_order)
select
  (select category from public.products where sku like 'S3D-%'
   group by category order by count(*) desc limit 1),
  'SYN-3D',
  'Synapse 3D',
  'Familia Synapse 3D. Packages por CCU e licencas a la carte na lista de precos HCUS.',
  (select bu from public.products where sku like 'S3D-%'
   group by bu order by count(*) desc limit 1),
  'HCUS', true, 0
where not exists (select 1 from public.products where sku = 'SYN-3D');

-- The ~80 module rows leave the picker. Nothing is deleted.
update public.products set active = false where sku like 'S3D-%';

-- ── 3. Repair the item links ────────────────────────────────────────────────
-- The earlier link matched 84 items against ~80 products with the same SKU
-- prefix. An UPDATE ... FROM with several matching rows picks an arbitrary one,
-- so those links are meaningless and are cleared before being rebuilt.
update public.product_items set product_id = null;

update public.product_items i set product_id = p.id
from public.products p
where i.family_code = 'SYNAPSE-3D' and p.sku = 'SYN-3D';

-- Within the PACS family the VNA lines belong to the VNA product, which the
-- catalogue already carries separately; the rest are PACS and Compute.
update public.product_items i set product_id = p.id
from public.products p
where i.family_code = 'SYNAPSE-PACS' and i.name ilike '%VNA%' and p.sku = 'SYN-VNA';

update public.product_items i set product_id = p.id
from public.products p
where i.family_code = 'SYNAPSE-PACS' and i.product_id is null and p.sku = 'SYN-PACS';

update public.product_items i set product_id = p.id
from public.products p
where i.family_code = 'VMWARE' and p.sku = 'VMW-ENT';

update public.product_items i set product_id = p.id
from public.products p
where i.family_code = 'SYN-PATH' and p.sku = 'SYNPATH-AI';

-- Gleamer, Lunit, Ibex, Extential, Avicenna, contextflow, AI Gateway and the
-- REiLI platform are left unlinked on purpose. The catalogue rows that look
-- similar are different products — Gleamer ChestView is not BoneView, and the
-- REiLI entries are AI models rather than the platform licence — so linking
-- them would be wrong rather than merely incomplete.

-- ── 4. What the catalogue looks like now ────────────────────────────────────
select coalesce(supplier_code, '(por atribuir)') as fornecedor,
       count(*) filter (where active) as ativos,
       count(*) filter (where not active) as inativos
from public.products group by 1 order by 2 desc;

select family_code,
       count(*) as itens,
       count(distinct product_id) as produtos,
       count(*) filter (where product_id is null) as sem_ligacao
from public.product_items group by family_code order by family_code;
