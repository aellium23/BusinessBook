-- Let the sales team read the price list.
--
-- The read policy shipped earlier restricted product_items to admin and
-- manager. That locks `member` out — and `member` is the salesperson the quick
-- quote exists for, who has to see cost to set a margin against it. The rule
-- was never "below manager sees no cost"; it is "our own people see cost, a
-- distributor never does", which is what the project conventions require.
--
-- `viewer` and `distributor` stay out. They keep reading names, units and CCU
-- capacities through product_items_v, which carries no money column.
--
-- Safe to run more than once.

drop policy if exists "product_items read" on public.product_items;
create policy "product_items read" on public.product_items for select using (
  exists (select 1 from public.profiles
          where id = auth.uid() and active = true
            and role in ('admin','manager','member'))
);

-- Writing the price list stays with admin and manager: a rep quotes from it,
-- but the cost of a licence is not theirs to edit.
drop policy if exists "product_items write" on public.product_items;
create policy "product_items write" on public.product_items for all using (
  exists (select 1 from public.profiles
          where id = auth.uid() and active = true and role in ('admin','manager'))
) with check (
  exists (select 1 from public.profiles
          where id = auth.uid() and active = true and role in ('admin','manager'))
);

select polname, polcmd, pg_get_expr(polqual, polrelid) as using_clause
from pg_policy where polrelid = 'public.product_items'::regclass order by polname;
