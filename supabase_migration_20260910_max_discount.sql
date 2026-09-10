-- What each supplier SKU will normally discount to.
--
-- HCUS does not negotiate a product family, it negotiates a part number.
-- Synapse licensing moves 50 to 80 per cent; the Oracle licence behind it moves
-- 20 at most. One percentage across a PACS quote is wrong on both halves at
-- once — optimistic on the Oracle line, leaving money on the table on the
-- Synapse one.
--
-- This is guidance, not a rule: HCUS decides. It exists so a rep asking 70 per
-- cent on an Oracle licence learns it before filing the case rather than after
-- it comes back refused.
--
-- Safe to run more than once.

alter table public.product_items
  add column if not exists max_discount_pct numeric(5,2);

comment on column public.product_items.max_discount_pct is
  'What this supplier normally discounts to on this SKU. Guidance shown to the rep, never enforced.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_items_max_discount_check') then
    alter table public.product_items
      add constraint product_items_max_discount_check
      check (max_discount_pct is null or (max_discount_pct >= 0 and max_discount_pct <= 100));
  end if;
end $$;

-- The Oracle licence. Named explicitly rather than by pattern, because
-- "COMPUTE" is a word that will turn up in other SKUs later.
update public.product_items set max_discount_pct = 20
where price_list = 'HCUS MI SUB 2026 V7.5'
  and name in ('COMPUTE STD 10K LIC FTYO', 'COMPUTE ENT 10K LIC FTYO',
               'COMPUTE STD 10K LIC CNV FTYO (CONVERSION)',
               'COMPUTE ENT 10K LIC CNV FTYO (CONVERSION)',
               'INT SYN COMPUTE STD 10K LIC OPEX FTYO',
               'INT SYN COMPUTE ENT 10K LIC OPEX FTYO',
               'INT SYN COMPUTE STD 10K LIC CNV OPEX FTYO',
               'INT SYN COMPUTE ENT 10K LIC CNV OPEX FTYO');

-- Synapse PACS and VNA licensing. The band given is 50 to 80; the ceiling is
-- the top of it, since it is what the rep may ask for, not what they will get.
update public.product_items set max_discount_pct = 80
where price_list = 'HCUS MI SUB 2026 V7.5'
  and family_code = 'SYNAPSE-PACS'
  and max_discount_pct is null
  and name not ilike '%COMPUTE%';

select family_code, name, transfer_price, max_discount_pct
from public.product_items
where max_discount_pct is not null
order by family_code, max_discount_pct, name;
