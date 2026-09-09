-- Who we buy from, and how a discount on our cost gets requested.
--
-- `products.brand` already says who MAKES a product (Fujifilm, Lunit, Gleamer).
-- This is a different question: who do we BUY it from, and therefore where does
-- a discount request go? Synapse PACS is a Fujifilm product bought from HCUS in
-- the United States, so the request goes into their Salesforce; CWM is also
-- Fujifilm but sold by VGT, so it goes to the Approvals module already in the
-- app. Conflating the two sends half the requests to the wrong place.
--
-- Safe to run more than once.

create table if not exists public.suppliers (
  code            text primary key,
  name            text not null,
  kind            text not null check (kind in ('internal','external')),
  -- How a rep asks this supplier for a better cost. Internal suppliers route to
  -- the Approvals module; external ones cannot, so the rep is told where to go.
  request_channel text,
  notes           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

insert into public.suppliers (code, name, kind, request_channel, notes) values
  ('VGT',    'Fujifilm Portugal (VGT)', 'internal', 'Approvals',
   'Pedido de desconto segue para o modulo de Approvals.'),
  ('HCUS',   'Fujifilm Healthcare US (HCUS)', 'external', 'Salesforce (HCUS)',
   'Discount request criado no Salesforce da HCUS pelo comercial.'),
  ('MEDSKY', 'Medsky', 'external', 'Email',
   'Pedido de proposta por email.')
on conflict (code) do update
  set name = excluded.name,
      kind = excluded.kind,
      request_channel = excluded.request_channel,
      notes = excluded.notes;

alter table public.suppliers enable row level security;

drop policy if exists "suppliers read" on public.suppliers;
create policy "suppliers read" on public.suppliers for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true)
);

drop policy if exists "suppliers write" on public.suppliers;
create policy "suppliers write" on public.suppliers for all using (
  exists (select 1 from public.profiles
          where id = auth.uid() and active = true and role in ('admin','manager'))
) with check (
  exists (select 1 from public.profiles
          where id = auth.uid() and active = true and role in ('admin','manager'))
);

revoke all on public.suppliers from anon;

-- What we pay for the product, and who we pay it to.
alter table public.products add column if not exists supplier_code  text;
alter table public.products add column if not exists transfer_price numeric(14,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_supplier_code_fkey'
  ) then
    alter table public.products
      add constraint products_supplier_code_fkey
      foreign key (supplier_code) references public.suppliers(code);
  end if;
end $$;

create index if not exists products_supplier_idx on public.products(supplier_code);

-- The discount we intend to ASK THE SUPPLIER FOR on a given deal line, and how
-- far that request has got. This is a discount on our cost, not on the customer
-- price — the customer-facing discount lives on the deal.
alter table public.deal_products add column if not exists cost_discount_pct numeric(6,2);
alter table public.deal_products add column if not exists cost_request_status text
  not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deal_products_cost_request_status_check'
  ) then
    alter table public.deal_products
      add constraint deal_products_cost_request_status_check
      check (cost_request_status in ('none','to_request','requested','approved','rejected'));
  end if;
end $$;

-- Which products still need a supplier assigned in the Products screen.
select sku, name, brand, supplier_code from public.products
where supplier_code is null order by name;
