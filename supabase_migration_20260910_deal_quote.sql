-- How a deal was quoted, kept so it can be opened again.
--
-- `deals` and `deal_products` store the answer: a value, a margin, lines with
-- prices. They do not store the question — which products were picked, the exam
-- volume they were priced on, the contract term, the man-days, a price typed
-- over a recommendation, the reason written beside a discount.
--
-- Without those, reopening a deal in the quick deal means guessing at them, and
-- a screen that guesses quietly rewrites a quote that was already sent to a
-- customer. So the inputs are stored, versioned, and read back verbatim. The
-- FIGURES are deliberately not stored here: they are derived from the inputs
-- every time, which stops this becoming a second source of truth that drifts
-- from the first.
--
-- Its own table rather than a column on `deals`, for the same reason the channel
-- economics moved: RLS filters rows, not columns, the deal list reads every
-- column, and this JSON can contain a cost.
--
-- Safe to run more than once.

create table if not exists public.deal_quote (
  deal_id    uuid primary key references public.deals(id) on delete cascade,
  state      jsonb not null,
  version    int not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.deal_quote is
  'The quick deal inputs behind a deal — products, volumes, term, effort, typed-over prices. Inputs only; every figure is derived from them.';

create index if not exists deal_quote_updated_idx on public.deal_quote(updated_at desc);

alter table public.deal_quote enable row level security;

-- Our own people work on any quote. A partner reopens their own — the state is
-- what they themselves typed, at their own prices — and nobody else's.
drop policy if exists "deal_quote read" on public.deal_quote;
create policy "deal_quote read" on public.deal_quote
  for select using (
    public.sees_internal_economics() or created_by = auth.uid()
  );

drop policy if exists "deal_quote write" on public.deal_quote;
create policy "deal_quote write" on public.deal_quote
  for all using (
    public.sees_internal_economics() or created_by = auth.uid()
  ) with check (
    public.sees_internal_economics() or created_by = auth.uid()
  );

-- Requires supabase_migration_20260910_distributor_guards.sql, which defines
-- sees_internal_economics(). Run that one first.
select count(*) as stored_quotes from public.deal_quote;
