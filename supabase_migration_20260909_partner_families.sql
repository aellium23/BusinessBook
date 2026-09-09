-- The remaining eight price-list families join the catalogue.
--
-- 100 of the 225 HCUS SKUs had no product to hang from. Each family gets one
-- catalogue entry and the SKUs live underneath it, the same shape as Synapse 3D
-- and Mobility — which is what stops the catalogue growing back into the flat
-- list of hundreds of licences we just took apart.
--
-- Category and BU are inherited from the Synapse 3D entry rather than invented,
-- so the families land where the rest of the software catalogue lives.
--
-- Safe to run more than once.

insert into public.products
  (category, sku, name, description, bu, supplier_code, active, sort_order)
select
  (select category from public.products where sku = 'SYN-3D'),
  f.sku, f.name, f.description,
  (select bu from public.products where sku = 'SYN-3D'),
  'HCUS', true, f.sort_order
from (values
  ('AVICENNA',         'Avicenna.AI',
   'IA de neurorradiologia: ICH, LVO e ASPECTS. Por estudo em escaloes de volume, ou licenca Enterprise / Standalone anual.', 10),
  ('LUNIT',            'Lunit INSIGHT',
   'CXR e MMG (2D e 2D+3D). Por estudo, em escaloes de volume anual.', 11),
  ('CONTEXTFLOW',      'contextflow ADVANCE Chest CT',
   'Por estudo, conforme o numero de exames anteriores comparados.', 12),
  ('GLEAMER-BONEVIEW', 'Gleamer BoneView',
   'Package anual por banda de volume de radiografia de trauma (1k a 50k por ano).', 13),
  ('IBEX-GALEN',       'Ibex Galen',
   'Por caso: prostata, mama H&E e HER2, gastrico. Inclui servicos de implementacao e integracao LIS.', 14),
  ('AI-GATEWAY',       'AI Gateway',
   'Licenca base com um modulo, modulos adicionais, anonimizador, ligacoes de outsourcing e alojamento na AWS EU.', 15),
  ('AI-REILI-PF',      'AI REiLI — plataforma (AIPF)',
   'Licenca de plataforma por base de dados e integracao por modulo. Distinta dos modelos REiLI, que sao produtos a parte.', 16),
  ('DP-ANALYTICS',     'DP Analytics & Reporting (Extential)',
   'Por utilizador ou administrador, em compra inicial, anuidade ou OPEX.', 17)
) as f(sku, name, description, sort_order)
where not exists (select 1 from public.products p where p.sku = f.sku);

-- Link each family's SKUs. One product per family, so no arbitrary match is
-- possible — the failure mode that corrupted the Synapse 3D links earlier.
update public.product_items i set product_id = p.id
from public.products p
where i.product_id is null and (
     (i.family_code = 'AVICENNA'    and p.sku = 'AVICENNA')
  or (i.family_code = 'LUNIT'       and p.sku = 'LUNIT')
  or (i.family_code = 'CONTEXTFLOW' and p.sku = 'CONTEXTFLOW')
  or (i.family_code = 'GLEAMER'     and p.sku = 'GLEAMER-BONEVIEW')
  or (i.family_code = 'IBEX'        and p.sku = 'IBEX-GALEN')
  or (i.family_code = 'AI-GATEWAY'  and p.sku = 'AI-GATEWAY')
  or (i.family_code = 'AI-REILI'    and p.sku = 'AI-REILI-PF')
  or (i.family_code = 'DP-EXT'      and p.sku = 'DP-ANALYTICS')
);

-- Two older catalogue rows are now narrower duplicates of a family that covers
-- them, so they leave the picker. Nothing is deleted and one update reverses
-- it: set active = true on either SKU.
--
--   LUNIT-MMG   → the Lunit family carries MMG and CXR
--   IBEX-BREAST → the Ibex family carries Breast H&E, HER2, Prostate and Gastric
--
-- Deliberately NOT touched: GLEAM-CHESTVIEW (ChestView is not BoneView and is
-- absent from this price list), DPE-SCANNER (scanner integration, not the BI
-- and Reporting seats) and the REILI-* models (the platform licence is a
-- different product from the models that run on it).
update public.products set active = false
where sku in ('LUNIT-MMG', 'IBEX-BREAST');

-- Nothing should remain unlinked.
select family_code,
       count(*) as itens,
       count(distinct product_id) as produtos,
       count(*) filter (where product_id is null) as sem_ligacao
from public.product_items group by family_code order by sem_ligacao desc, family_code;
