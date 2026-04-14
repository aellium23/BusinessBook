-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-18 (audit log)
--   • Generic audit_log + trigger function
--   • Triggers on deals, contacts, tenders, tender_requirements,
--     quotas, attachments
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.audit_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  action       text not null check (action in ('insert','update','delete')),
  table_name   text not null,
  record_id    uuid,
  changed      jsonb, -- { "field": { "old": ..., "new": ... }, ... }
  snapshot     jsonb  -- full new row on insert; full old row on delete
);

create index if not exists audit_log_time_idx  on public.audit_log (at desc);
create index if not exists audit_log_table_idx on public.audit_log (table_name, at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, at desc);
create index if not exists audit_log_record_idx on public.audit_log (record_id);

-- RLS: admin-only read. Writes happen via SECURITY DEFINER trigger, so no
-- INSERT policy is needed (RLS is bypassed for the trigger function).
alter table public.audit_log enable row level security;

drop policy if exists "audit read admins" on public.audit_log;
create policy "audit read admins" on public.audit_log for select using (
  auth.uid() in (select id from public.profiles where role = 'admin')
);

-- ------------------------------------------------------------
-- Generic audit trigger
-- ------------------------------------------------------------
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer as $$
declare
  v_changed jsonb;
  v_snapshot jsonb;
  v_rec_id uuid;
  v_email text;
begin
  -- Try to record which user made the change; may be NULL in system contexts.
  select email into v_email from auth.users where id = auth.uid();

  if (tg_op = 'INSERT') then
    v_snapshot := to_jsonb(new);
    v_rec_id := nullif(v_snapshot->>'id','')::uuid;
    insert into public.audit_log(actor_id, actor_email, action, table_name, record_id, snapshot)
    values (auth.uid(), v_email, 'insert', tg_table_name, v_rec_id, v_snapshot);
    return new;

  elsif (tg_op = 'UPDATE') then
    v_rec_id := nullif(to_jsonb(new)->>'id','')::uuid;
    -- Diff: union of keys from old+new, keeping only those where the value
    -- actually changed. Skip noisy fields that change on every write.
    select jsonb_object_agg(
      k.key,
      jsonb_build_object('old', to_jsonb(old) -> k.key, 'new', to_jsonb(new) -> k.key)
    )
      into v_changed
      from (
        select jsonb_object_keys(to_jsonb(new)) as key
        union
        select jsonb_object_keys(to_jsonb(old)) as key
      ) k
      where (to_jsonb(old) -> k.key) is distinct from (to_jsonb(new) -> k.key)
        and k.key not in ('updated_at','stage_changed_at');

    -- If nothing changed in meaningful fields, don't write a log row.
    if v_changed is not null then
      insert into public.audit_log(actor_id, actor_email, action, table_name, record_id, changed)
      values (auth.uid(), v_email, 'update', tg_table_name, v_rec_id, v_changed);
    end if;
    return new;

  elsif (tg_op = 'DELETE') then
    v_snapshot := to_jsonb(old);
    v_rec_id := nullif(v_snapshot->>'id','')::uuid;
    insert into public.audit_log(actor_id, actor_email, action, table_name, record_id, snapshot)
    values (auth.uid(), v_email, 'delete', tg_table_name, v_rec_id, v_snapshot);
    return old;
  end if;

  return null;
end;
$$;

-- ------------------------------------------------------------
-- Attach triggers to key tables
-- ------------------------------------------------------------
drop trigger if exists audit_deals on public.deals;
create trigger audit_deals
  after insert or update or delete on public.deals
  for each row execute procedure public.audit_trigger();

drop trigger if exists audit_contacts on public.contacts;
create trigger audit_contacts
  after insert or update or delete on public.contacts
  for each row execute procedure public.audit_trigger();

drop trigger if exists audit_tenders on public.tenders;
create trigger audit_tenders
  after insert or update or delete on public.tenders
  for each row execute procedure public.audit_trigger();

drop trigger if exists audit_tender_requirements on public.tender_requirements;
create trigger audit_tender_requirements
  after insert or update or delete on public.tender_requirements
  for each row execute procedure public.audit_trigger();

drop trigger if exists audit_quotas on public.quotas;
create trigger audit_quotas
  after insert or update or delete on public.quotas
  for each row execute procedure public.audit_trigger();

drop trigger if exists audit_attachments on public.attachments;
create trigger audit_attachments
  after insert or update or delete on public.attachments
  for each row execute procedure public.audit_trigger();
