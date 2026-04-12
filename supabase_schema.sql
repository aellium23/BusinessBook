-- ============================================================
-- BusinessBook FY26  Supabase Schema
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. PROFILES
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'viewer'
               check (role in ('admin','vgt','ect','viewer')),
  created_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
create policy "admin see all" on public.profiles for select
  using (exists (select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy "admin update" on public.profiles for update
  using (exists (select 1 from public.profiles where id=auth.uid() and role='admin'));

-- 2. DEALS
create table if not exists public.deals (
  id          uuid primary key default gen_random_uuid(),
  bu          text not null check (bu in ('VGT','ECT')),
  sales_type  text default 'External',
  stage       text not null check (stage in ('Lead','Pipeline','BackLog','Invoiced')),
  client      text not null,
  region      text,
  country     text,
  sales_owner text,
  deal_type   text default 'One-Shot',
  description text,
  value_total numeric(14,2) default 0,
  gm_pct      numeric(6,4)  default 0,
  rec_month   text, rec_year int,
  cs_month    text, cs_year  int,
  ce_month    text, ce_year  int,
  apr numeric(12,2) default 0, may numeric(12,2) default 0,
  jun numeric(12,2) default 0, jul numeric(12,2) default 0,
  aug numeric(12,2) default 0, sep numeric(12,2) default 0,
  oct numeric(12,2) default 0, nov numeric(12,2) default 0,
  dec numeric(12,2) default 0, jan numeric(12,2) default 0,
  feb numeric(12,2) default 0, mar numeric(12,2) default 0,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists deals_updated_at on public.deals;
create trigger deals_updated_at
  before update on public.deals
  for each row execute procedure public.set_updated_at();

alter table public.deals enable row level security;

create policy "admin all deals"   on public.deals for all
  using (exists (select 1 from public.profiles where id=auth.uid() and role='admin'));

create policy "vgt select"  on public.deals for select
  using (bu='VGT' and exists (select 1 from public.profiles where id=auth.uid() and role='vgt'));
create policy "vgt insert"  on public.deals for insert
  with check (bu='VGT' and exists (select 1 from public.profiles where id=auth.uid() and role='vgt'));
create policy "vgt update"  on public.deals for update
  using (bu='VGT' and exists (select 1 from public.profiles where id=auth.uid() and role='vgt'));
create policy "vgt delete"  on public.deals for delete
  using (bu='VGT' and exists (select 1 from public.profiles where id=auth.uid() and role='vgt'));

create policy "ect select"  on public.deals for select
  using (bu='ECT' and exists (select 1 from public.profiles where id=auth.uid() and role='ect'));
create policy "ect insert"  on public.deals for insert
  with check (bu='ECT' and exists (select 1 from public.profiles where id=auth.uid() and role='ect'));
create policy "ect update"  on public.deals for update
  using (bu='ECT' and exists (select 1 from public.profiles where id=auth.uid() and role='ect'));
create policy "ect delete"  on public.deals for delete
  using (bu='ECT' and exists (select 1 from public.profiles where id=auth.uid() and role='ect'));

create policy "viewer read all" on public.deals for select
  using (exists (select 1 from public.profiles where id=auth.uid() and role='viewer'));

-- 3. BUDGET
create table if not exists public.budget (
  id       uuid primary key default gen_random_uuid(),
  bu       text not null check (bu in ('VGT','ECT')),
  cycle    text not null check (cycle in ('BUD','EST1','EST2')),
  pl_key   text not null check (pl_key in ('ns_int','ns_ext','cogs','rd','sgas')),
  apr numeric(12,3) default 0, may numeric(12,3) default 0,
  jun numeric(12,3) default 0, jul numeric(12,3) default 0,
  aug numeric(12,3) default 0, sep numeric(12,3) default 0,
  oct numeric(12,3) default 0, nov numeric(12,3) default 0,
  dec numeric(12,3) default 0, jan numeric(12,3) default 0,
  feb numeric(12,3) default 0, mar numeric(12,3) default 0,
  updated_at timestamptz default now(),
  unique (bu, cycle, pl_key)
);

alter table public.budget enable row level security;
create policy "admin manage budget" on public.budget for all
  using (exists (select 1 from public.profiles where id=auth.uid() and role='admin'));
create policy "all read budget" on public.budget for select using (auth.uid() is not null);

-- 4. PENDING INVITES
create table if not exists public.pending_invites (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  role       text not null default 'viewer',
  invited_by uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table public.pending_invites enable row level security;
create policy "admin manage invites" on public.pending_invites for all
  using (exists (select 1 from public.profiles where id=auth.uid() and role='admin'));

create or replace function public.apply_pending_invite()
returns trigger language plpgsql security definer as $$
declare pending record;
begin
  select * into pending from public.pending_invites
  where email = new.email order by created_at desc limit 1;
  if found then
    update public.profiles set role = pending.role where id = new.id;
    delete from public.pending_invites where id = pending.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute procedure public.apply_pending_invite();

-- 5. VGT Budget seed (from FY26_VGT_BUD.xlsx)
insert into public.budget (bu,cycle,pl_key,apr,may,jun,jul,aug,sep,oct,nov,dec,jan,feb,mar) values
  ('VGT','BUD','ns_int',222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583),
  ('VGT','BUD','ns_ext',278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467),
  ('VGT','BUD','cogs',  238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.845),
  ('VGT','BUD','rd',    0,0,0,0,0,0,0,0,0,0,0,0),
  ('VGT','BUD','sgas',  0,0,0,0,0,0,0,0,0,0,0,0),
  ('VGT','EST1','ns_int',222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583),
  ('VGT','EST1','ns_ext',278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467),
  ('VGT','EST1','cogs',  238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.845),
  ('VGT','EST1','rd',    0,0,0,0,0,0,0,0,0,0,0,0),
  ('VGT','EST1','sgas',  0,0,0,0,0,0,0,0,0,0,0,0),
  ('VGT','EST2','ns_int',222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583),
  ('VGT','EST2','ns_ext',278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467),
  ('VGT','EST2','cogs',  238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.974,238.845),
  ('VGT','EST2','rd',    0,0,0,0,0,0,0,0,0,0,0,0),
  ('VGT','EST2','sgas',  0,0,0,0,0,0,0,0,0,0,0,0)
on conflict (bu,cycle,pl_key) do update set
  apr=excluded.apr,may=excluded.may,jun=excluded.jun,jul=excluded.jul,
  aug=excluded.aug,sep=excluded.sep,oct=excluded.oct,nov=excluded.nov,
  dec=excluded.dec,jan=excluded.jan,feb=excluded.feb,mar=excluded.mar;

-- ============================================================
-- AFTER FIRST LOGIN: make yourself admin
-- update public.profiles set role='admin', full_name='Elio Santos'
-- where email='your@email.here';
-- ============================================================
